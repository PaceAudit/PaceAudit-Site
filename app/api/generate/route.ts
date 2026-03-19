import { NextResponse } from "next/server";
import { generateBlogAndSocial, saveContentAndSetReview } from "@/lib/ai-service";

/**
 * POST /api/generate?topicId= — Unified blog + social generation.
 * Uses Gemini 3.1 Pro for the blog, then Gemini 2.5 Flash for social posts.
 * Saves full payload and returns content so the UI can update all fields at once.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const topicIdParam = searchParams.get("topicId");
  const numericId = parseInt(topicIdParam as string, 10);

  if (Number.isNaN(numericId) || numericId < 1) {
    return NextResponse.json(
      { error: "Invalid topic ID" },
      { status: 400 }
    );
  }

  try {
    const result = await generateBlogAndSocial(numericId);
    console.log("AI Result:", result);

    if ("error" in result) {
      console.error("[api/generate] Soft error from AI:", result.error);
      return NextResponse.json(
        { success: false, error: result.error, topicId: numericId },
        { status: 500 }
      );
    }

    const blogHtml = result.blog_html ?? "";
    const metaDescription = result.meta_description ?? "";
    const seoTags = Array.isArray(result.seo_tags) ? JSON.stringify(result.seo_tags) : "[]";
    const linkedinPosts = result.linkedin_posts ?? [result.linkedin_post ?? ""];
    const twitterPosts = result.twitter_posts ?? [result.twitter_post ?? ""];
    const instagramPosts = result.instagram_posts ?? [result.instagram_post ?? ""];
    const payload = {
      blog_html: blogHtml,
      meta_description: metaDescription || null,
      seo_tags: JSON.parse(seoTags) as string[],
      linkedin_post: linkedinPosts[0] ?? "",
      instagram_post: instagramPosts[0] ?? "",
      twitter_post: twitterPosts[0] ?? "",
      image_suggestion_prompt: result.image_suggestion_prompt ?? "",
      linkedin_posts: linkedinPosts,
      twitter_posts: twitterPosts,
      instagram_posts: instagramPosts,
    };

    try {
      await saveContentAndSetReview(numericId, payload, null);
    } catch (dbError) {
      console.error("[api/generate] CRITICAL DB SAVE ERROR:", dbError);
    }

    const seoTagsArr = JSON.parse(seoTags) as string[];
    const content = {
      blogHtml,
      blog_html: blogHtml,
      metaDescription,
      meta_description: metaDescription,
      seoTags: seoTagsArr,
      seo_tags: seoTagsArr,
      linkedinPost: linkedinPosts[0] ?? "",
      linkedin_copy: linkedinPosts,
      twitterPost: twitterPosts[0] ?? "",
      twitter_copy: twitterPosts,
      instagramPost: instagramPosts[0] ?? "",
      instagram_copy: instagramPosts,
    };
    return NextResponse.json({
      success: true,
      ok: true,
      content,
      modelUsed: result.modelUsed,
    });
  } catch (e) {
    console.error("POST /api/generate", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        success: false,
        error: message.includes("Malformed JSON")
          ? "Token cutoff / Malformed JSON"
          : message || "Generation failed",
        topicId: numericId,
      },
      { status: 500 }
    );
  }
}
