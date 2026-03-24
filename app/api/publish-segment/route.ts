import { NextResponse } from "next/server";
import { getDb, useTurso } from "@/lib/db";
import { buildBlogPostHtml } from "@/lib/blog-template";
import { publishToX, publishToLinkedIn } from "@/lib/scheduler";
import { publishToInstagram } from "@/lib/publish-service";
import { deployFileToNetlify } from "@/lib/netlify-deploy";
import {
  getSiteUrlFromRequest,
  resolvePublicImageUrlForInstagram,
} from "@/lib/instagram-public-image";

function slugify(title: string): string {
  return title.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "post";
}

function isPublicHttpUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    const host = (u.hostname || "").toLowerCase();
    if (!(u.protocol === "http:" || u.protocol === "https:")) return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("172.16.") || host.startsWith("172.17.") || host.startsWith("172.18.") || host.startsWith("172.19.") || host.startsWith("172.20.") || host.startsWith("172.21.") || host.startsWith("172.22.") || host.startsWith("172.23.") || host.startsWith("172.24.") || host.startsWith("172.25.") || host.startsWith("172.26.") || host.startsWith("172.27.") || host.startsWith("172.28.") || host.startsWith("172.29.") || host.startsWith("172.30.") || host.startsWith("172.31.")) return false;
    return true;
  } catch {
    return false;
  }
}

function parseJsonArray(raw: string | null | undefined): string[] {
  if (raw == null || !String(raw).trim()) return [];
  try {
    const arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parsePostedIndices(raw: string | null | undefined): number[] {
  if (raw == null || !String(raw).trim()) return [];
  try {
    const arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "number" && Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

/**
 * POST /api/publish-segment
 * Body: { topicId: number, platform: 'blog' | 'linkedin' | 'twitter' | 'instagram', index?: number }
 * Publishes one segment (blog or one social post at index) and marks it as posted so the scheduler won't double-post.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    console.log("[PUBLISH_SEGMENT] Incoming payload:", body);
    const topicId = typeof body.topicId === "number" ? body.topicId : parseInt(String(body.topicId ?? ""), 10);
    const platform = String(body.platform ?? "").toLowerCase();
    const index = typeof body.index === "number" ? Math.max(0, Math.floor(body.index)) : 0;
    console.log("[PUBLISH_SEGMENT] Parsed payload:", { topicId, platform, index });
    const requestCaption = typeof body.caption === "string" ? body.caption.trim() : "";
    const requestImageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";

    // #region agent log
    fetch("http://127.0.0.1:7822/ingest/d299f8e8-acc9-48de-a2c7-afb2bceab8c9", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "584c98" },
      body: JSON.stringify({
        sessionId: "584c98",
        runId: "debug-pre",
        hypothesisId: "H1",
        location: "app/api/publish-segment/route.ts:POST:start",
        message: "Publish segment request received",
        data: { tursoConfigured: useTurso(), topicId, platform, index },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (Number.isNaN(topicId) || topicId < 1) {
      return NextResponse.json({ error: "Valid topicId required" }, { status: 400 });
    }
    const valid = ["blog", "linkedin", "twitter", "instagram"];
    if (!valid.includes(platform)) {
      return NextResponse.json({ error: "platform must be blog, linkedin, twitter, or instagram" }, { status: 400 });
    }

    const db = await getDb();

    console.log("[PUBLISH_SEGMENT] DB lookup vars:", { topicId, platform, index });

    // Diagnostic: log what we actually have saved for this topicId in Content (no joins).
    const allTopicContent = await db
      .prepare(
        `SELECT id, topic_id,
                blog_html, meta_description, seo_tags, image_url,
                linkedin_copy, twitter_copy, facebook_copy,
                linkedin_image_urls, instagram_image_urls,
                linkedin_posted_indices, twitter_posted_indices, instagram_posted_indices
         FROM Content
         WHERE topic_id = ?`
      )
      .all(topicId);
    console.log(`[PUBLISH_SEGMENT] ALL content saved for topicId=${topicId}:`, allTopicContent);

    // Prefer querying Content directly (avoid INNER JOIN hiding the row if Topics is missing).
    const contentRow = (await db
      .prepare(
        `SELECT c.id, c.topic_id, c.blog_html, c.meta_description, c.seo_tags, c.image_url,
                c.linkedin_copy, c.twitter_copy, c.facebook_copy,
                c.linkedin_image_urls, c.instagram_image_urls,
                c.linkedin_posted_indices, c.twitter_posted_indices, c.instagram_posted_indices,
                t.title
         FROM Content c
         LEFT JOIN Topics t ON t.id = c.topic_id
         WHERE c.topic_id = ?`
      )
      .get(topicId)) as Record<string, unknown> | undefined;

    // Also log the Topics row to distinguish "missing topic" vs "missing content".
    const topicRow = await db.prepare("SELECT * FROM Topics WHERE id = ?").get(topicId);
    console.log("[PUBLISH_SEGMENT] Topics row result:", topicRow);
    console.log("[PUBLISH_SEGMENT] contentRow result:", contentRow);

    // #region agent log
    fetch("http://127.0.0.1:7822/ingest/d299f8e8-acc9-48de-a2c7-afb2bceab8c9", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "584c98" },
      body: JSON.stringify({
        sessionId: "584c98",
        runId: "debug-pre",
        hypothesisId: "H2",
        location: "app/api/publish-segment/route.ts:POST:db-lookup",
        message: "Publish segment DB lookup results",
        data: {
          allTopicContentLength: Array.isArray(allTopicContent) ? allTopicContent.length : 0,
          topicRowExists: topicRow != null,
          contentRowExists: contentRow != null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (!contentRow || contentRow.id == null) {
      // Allow Instagram manual publish from request fields when DB rows are missing.
      if (platform === "instagram" && requestCaption && requestImageUrl) {
        const siteUrl = getSiteUrlFromRequest(request);

        const isHttpUrl = requestImageUrl.startsWith("http");
        const isDataUrl = requestImageUrl.startsWith("data:");
        const imgKind = isHttpUrl ? "http" : isDataUrl ? "data" : "other";
        console.log("[PUBLISH_SEGMENT] content missing; publishing instagram from request fields:", {
          topicId,
          index,
          captionLen: requestCaption.length,
          imageKind: imgKind,
          siteUrlDerived: {
            envPresent: !!process.env.SITE_URL?.trim(),
            origin: siteUrl ?? null,
          },
        });

        let publicUrl: string | null = isHttpUrl ? requestImageUrl : null;
        if (!publicUrl && isDataUrl && siteUrl) {
          console.log("[PUBLISH_SEGMENT] converting data URL -> public URL via ensurePublicImageUrl:", {
            topicId,
            index,
            siteUrlPresent: !!siteUrl,
            siteUrlPrefix: siteUrl ? siteUrl.slice(0, 32) : null,
          });
          publicUrl = await resolvePublicImageUrlForInstagram(requestImageUrl, topicId, index, siteUrl);
          console.log("[PUBLISH_SEGMENT] ensurePublicImageUrl result:", {
            topicId,
            index,
            publicUrlPresent: !!publicUrl,
            publicUrlPrefix: publicUrl ? publicUrl.slice(0, 32) : null,
          });
        }
        if (!publicUrl || !isPublicHttpUrl(publicUrl)) {
          console.log("[PUBLISH_SEGMENT] no publicUrl could be derived:", {
            topicId,
            index,
            siteUrlPresent: !!siteUrl,
            isDataUrl,
            publicUrlPrefix: publicUrl ? publicUrl.slice(0, 48) : null,
            isPublic: publicUrl ? isPublicHttpUrl(publicUrl) : false,
          });
          return NextResponse.json(
            {
              error:
                "Instagram requires a publicly reachable image URL (not localhost/private network). Set SITE_URL to your public HTTPS app URL (or use a hosted image URL), then try again.",
            },
            { status: 400 }
          );
        }

        const result = await publishToInstagram(topicId, requestCaption, publicUrl);
        if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });

        return NextResponse.json({
          ok: true,
          platform: "instagram",
          index,
          publishedFromRequest: true,
          postedIndexUpdateSkipped: true,
        });
      }

      // #region agent log
      fetch("http://127.0.0.1:7822/ingest/d299f8e8-acc9-48de-a2c7-afb2bceab8c9", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "584c98" },
        body: JSON.stringify({
          sessionId: "584c98",
          runId: "debug-pre",
          hypothesisId: "H1",
          location: "app/api/publish-segment/route.ts:POST:return-404",
          message: "Publishing segment failed: content missing",
          data: {
            topicId,
            platform,
            index,
            allTopicContentLength: Array.isArray(allTopicContent) ? allTopicContent.length : 0,
            topicRowExists: topicRow != null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return NextResponse.json({ error: "Content not found for topic" }, { status: 404 });
    }

    const contentId = contentRow.id as number;
    const title = String(contentRow.title ?? "");

    if (platform === "blog") {
      const blogHtml = String(contentRow.blog_html ?? "").trim();
      if (!blogHtml) {
        return NextResponse.json({ error: "No blog content to publish" }, { status: 400 });
      }
      const slug = slugify(title);
      const path = `articles/${slug}.html`;
      const html = buildBlogPostHtml({
        title,
        metaDescription: (contentRow.meta_description as string) ?? null,
        seoTags: (contentRow.seo_tags as string) ?? null,
        blogHtml,
        imageUrl: (contentRow.image_url as string) ?? null,
        blogDate: null,
      });
      const netlifyRes = await deployFileToNetlify({
        filePath: path,
        content: html,
        contentType: "text/html; charset=utf-8",
      });
      if (!netlifyRes.ok) {
        return NextResponse.json({ ok: false, error: netlifyRes.error ?? "Netlify publish failed" }, { status: 500 });
      }
      const now = new Date().toISOString();
      await db.prepare("UPDATE Content SET status = 'Published', published_date = ? WHERE id = ?").run(now, contentId);
      await db.prepare("UPDATE Topics SET status = 'Published' WHERE id = ?").run(topicId);
      return NextResponse.json({ ok: true, platform: "blog" });
    }

    // Social: linkedin | twitter | instagram
    const linkedinCopy = parseJsonArray(contentRow.linkedin_copy as string);
    const twitterCopy = parseJsonArray(contentRow.twitter_copy as string);
    const facebookCopy = parseJsonArray(contentRow.facebook_copy as string);
    const linkedinPosted = parsePostedIndices(contentRow.linkedin_posted_indices as string);
    const twitterPosted = parsePostedIndices(contentRow.twitter_posted_indices as string);
    const instagramPosted = parsePostedIndices(contentRow.instagram_posted_indices as string);

    if (platform === "linkedin") {
      const text = linkedinCopy[index]?.trim();
      if (!text) return NextResponse.json({ error: "No LinkedIn post at this index" }, { status: 400 });
      if (linkedinPosted.includes(index)) {
        return NextResponse.json({ ok: true, platform: "linkedin", index, alreadyPosted: true });
      }
      const result = await publishToLinkedIn(text);
      if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
      const next = [...linkedinPosted, index].sort((a, b) => a - b);
      await db.prepare("UPDATE Content SET linkedin_posted_indices = ? WHERE id = ?").run(JSON.stringify(next), contentId);
      return NextResponse.json({ ok: true, platform: "linkedin", index });
    }

    if (platform === "twitter") {
      const text = (twitterCopy[index] ?? "").trim().slice(0, 280);
      if (!text) return NextResponse.json({ error: "No Twitter post at this index" }, { status: 400 });
      if (twitterPosted.includes(index)) {
        return NextResponse.json({ ok: true, platform: "twitter", index, alreadyPosted: true });
      }
      const result = await publishToX(text);
      if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
      const next = [...twitterPosted, index].sort((a, b) => a - b);
      await db.prepare("UPDATE Content SET twitter_posted_indices = ? WHERE id = ?").run(JSON.stringify(next), contentId);
      return NextResponse.json({ ok: true, platform: "twitter", index });
    }

    if (platform === "instagram") {
      const caption = facebookCopy[index]?.trim();
      if (!caption) return NextResponse.json({ error: "No Instagram caption at this index" }, { status: 400 });
      if (instagramPosted.includes(index)) {
        return NextResponse.json({ ok: true, platform: "instagram", index, alreadyPosted: true });
      }
      const igUrlsRaw = contentRow.instagram_image_urls as string | undefined;
      let igUrls: string[] = [];
      try {
        if (igUrlsRaw) igUrls = JSON.parse(igUrlsRaw);
      } catch {
        /* ignore */
      }
      const imageUrl = (Array.isArray(igUrls) ? igUrls[index] : null) ?? (contentRow.image_url as string);
      const siteUrl = getSiteUrlFromRequest(request);
      let publicUrl: string | null =
        imageUrl && String(imageUrl).startsWith("http") ? String(imageUrl) : null;
      if (!publicUrl && imageUrl && siteUrl) {
        publicUrl = await resolvePublicImageUrlForInstagram(imageUrl, contentId, index, siteUrl);
      }
      if (!publicUrl || !isPublicHttpUrl(publicUrl)) {
        const hasDataUrl = imageUrl && String(imageUrl).startsWith("data:");
        return NextResponse.json(
          {
            error:
              hasDataUrl || (publicUrl && !isPublicHttpUrl(publicUrl))
                ? "Instagram requires a publicly reachable image URL (not localhost/private network). Set SITE_URL to your public HTTPS app URL (or use a hosted image URL), then try again."
                : "Instagram requires a public image URL. Add an image and set SITE_URL, or use a hosted image URL.",
          },
          { status: 400 }
        );
      }
      const result = await publishToInstagram(contentId, caption, publicUrl);
      if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
      const next = [...instagramPosted, index].sort((a, b) => a - b);
      await db.prepare("UPDATE Content SET instagram_posted_indices = ? WHERE id = ?").run(JSON.stringify(next), contentId);
      return NextResponse.json({ ok: true, platform: "instagram", index });
    }

    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[publish-segment]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
