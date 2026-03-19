import { NextResponse } from "next/server";
import {
  saveContentAndSetReview,
  generateBlogWithContext,
  generateSocialMediaWithContext,
  generateSingleSocialPost,
  parseAndStripBlogFrontmatter,
  getRecentPostsForBlogContext,
} from "@/lib/ai-service";
import { getDb } from "@/lib/db";

/**
 * POST /api/regenerate
 * Body: { topicId: number, scope: "all" | "blog" | "linkedin" | "twitter" | "instagram", context?: string, index?: number }
 * Regenerates content with optional user context for refinement.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const topicId = typeof body.topicId === "number" ? body.topicId : parseInt(String(body.topicId ?? ""), 10);
    const scope = body.scope ?? "all";
    const context = typeof body.context === "string" ? body.context.trim() : "";
    const index = typeof body.index === "number" ? Math.max(0, Math.floor(body.index)) : 0;

    console.log("[api/regenerate]", { topicId, scope, index, contextLength: context.length, context: context || "(none)" });

    if (Number.isNaN(topicId) || topicId < 1) {
      return NextResponse.json({ error: "Valid topicId is required" }, { status: 400 });
    }

    const validScopes = ["all", "blog", "linkedin", "twitter", "instagram"];
    if (!validScopes.includes(scope)) {
      return NextResponse.json({ error: "scope must be all, blog, linkedin, twitter, or instagram" }, { status: 400 });
    }

    const db = await getDb();

    if (scope === "all") {
      let parsed: { blog_html: string; meta_description: string | null; seo_tags: string[] };
      let social: {
        linkedin_post: string;
        instagram_post: string;
        twitter_post: string;
        linkedin_posts: string[];
        twitter_posts: string[];
        instagram_posts: string[];
      };
      try {
        const recentPosts = await getRecentPostsForBlogContext(topicId);
        const blogText = await generateBlogWithContext(topicId, context, recentPosts);
        parsed = parseAndStripBlogFrontmatter(blogText);
        social = await generateSocialMediaWithContext(parsed.blog_html, context);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
      const liCopy = social.linkedin_posts?.length ? social.linkedin_posts : [social.linkedin_post];
      const twCopy = social.twitter_posts?.length ? social.twitter_posts : [social.twitter_post];
      const igCopy = social.instagram_posts?.length ? social.instagram_posts : [social.instagram_post];
      const result = {
        blog_html: parsed.blog_html,
        meta_description: parsed.meta_description ?? null,
        seo_tags: parsed.seo_tags?.length ? parsed.seo_tags : [],
        linkedin_post: social.linkedin_post,
        instagram_post: social.instagram_post,
        twitter_post: social.twitter_post,
        image_suggestion_prompt: "",
        linkedin_posts: liCopy,
        twitter_posts: twCopy,
        instagram_posts: igCopy,
      };
      await saveContentAndSetReview(topicId, result, null);
      return NextResponse.json({
        ok: true,
        content: {
          blogHtml: result.blog_html,
          metaDescription: result.meta_description ?? "",
          seoTags: result.seo_tags ?? [],
          linkedinPost: liCopy[0] ?? "",
          twitterPost: twCopy[0] ?? "",
          instagramPost: igCopy[0] ?? "",
          linkedin_copy: liCopy,
          twitter_copy: twCopy,
          instagram_copy: igCopy,
        },
      });
    }

    if (scope === "blog") {
      const recentPosts = await getRecentPostsForBlogContext(topicId);
      const blogText = await generateBlogWithContext(topicId, context, recentPosts);
      const parsed = parseAndStripBlogFrontmatter(blogText);
      const metaDescription = parsed.meta_description ?? null;
      const seoTags = parsed.seo_tags?.length ? JSON.stringify(parsed.seo_tags) : "[]";
      const row = (await db.prepare("SELECT blog_html, meta_description, seo_tags, linkedin_copy, twitter_copy, facebook_copy, image_url FROM Content WHERE topic_id = ?").get(topicId)) as Record<string, unknown> | undefined;
      const linkedinCopy = row?.linkedin_copy ?? "[]";
      const twitterCopy = row?.twitter_copy ?? "[]";
      const facebookCopy = row?.facebook_copy ?? "[]";
      await db.prepare("UPDATE Content SET blog_html = ?, meta_description = ?, seo_tags = ? WHERE topic_id = ?").run(parsed.blog_html, metaDescription, seoTags, topicId);
      const toArr = (s: unknown): string[] => {
        if (Array.isArray(s)) return s.filter((x): x is string => typeof x === "string");
        if (typeof s !== "string") return [];
        try {
          const p = JSON.parse(s) as unknown;
          return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
        } catch {
          return [];
        }
      };
      return NextResponse.json({
        ok: true,
        content: {
          blogHtml: parsed.blog_html,
          metaDescription: metaDescription ?? "",
          seoTags: parsed.seo_tags ?? [],
          linkedin_copy: toArr(linkedinCopy),
          twitter_copy: toArr(twitterCopy),
          instagram_copy: toArr(facebookCopy),
        },
      });
    }

    // scope is linkedin, twitter, or instagram — use Markdown Content from request (current UI) or fall back to DB
    const blogHtmlFromBody = typeof body.blogHtml === "string" ? body.blogHtml.trim() : "";
    const blogHtmlFromDb = (await db.prepare("SELECT blog_html FROM Content WHERE topic_id = ?").get(topicId)) as { blog_html?: string } | undefined;
    const blogHtml = blogHtmlFromBody || (blogHtmlFromDb?.blog_html ?? "");
    if (!blogHtml.trim()) {
      return NextResponse.json({ error: "No blog content to use. Add Markdown Content for the blog or generate the blog first." }, { status: 400 });
    }

    // For individual regeneration, only regenerate the requested index and keep the rest intact.
    // This avoids the "full cadence JSON" requirement when the user clicks Regenerate on one post.
    const row = (await db.prepare("SELECT linkedin_copy, twitter_copy, facebook_copy FROM Content WHERE topic_id = ?").get(topicId)) as unknown as Record<string, string> | undefined;
    const li = row?.linkedin_copy ?? "[]";
    const tw = row?.twitter_copy ?? "[]";
    const fb = row?.facebook_copy ?? "[]";

    const safeArr = (raw: string, minLen: number) => {
      try {
        const p = JSON.parse(raw) as unknown;
        const arr = Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
        while (arr.length < minLen) arr.push("");
        return arr;
      } catch {
        return Array.from({ length: minLen }, () => "");
      }
    };

    let liArr = safeArr(li, 3);
    let twArr = safeArr(tw, 6);
    let fbArr = safeArr(fb, 3);

    const blogTitle = typeof body.blogTitle === "string" && body.blogTitle.trim()
      ? body.blogTitle.trim()
      : "Blog Post";

    if (scope === "linkedin") {
      const single = await generateSingleSocialPost("linkedin", index, blogTitle, blogHtml, context);
      liArr[index] = single.caption;
    } else if (scope === "twitter") {
      const single = await generateSingleSocialPost("twitter", index, blogTitle, blogHtml, context);
      twArr[index] = single.caption;
    } else {
      const single = await generateSingleSocialPost("instagram", index, blogTitle, blogHtml, context);
      fbArr[index] = single.caption;
    }

    const linkedinCopy = JSON.stringify(liArr);
    const twitterCopy = JSON.stringify(twArr);
    const facebookCopy = JSON.stringify(fbArr);

    await db.prepare("UPDATE Content SET linkedin_copy = ?, twitter_copy = ?, facebook_copy = ? WHERE topic_id = ?").run(linkedinCopy, twitterCopy, facebookCopy, topicId);

    return NextResponse.json({
      ok: true,
      content: {
        linkedinPost: liArr[0] ?? "",
        twitterPost: twArr[0] ?? "",
        instagramPost: fbArr[0] ?? "",
        linkedin_copy: liArr,
        twitter_copy: twArr,
        instagram_copy: fbArr,
      },
    });
  } catch (e) {
    console.error("POST /api/regenerate", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message || "Regeneration failed" }, { status: 500 });
  }
}
