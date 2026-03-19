import { NextResponse } from "next/server";
import { generateSocialMedia } from "@/lib/ai-service";
import { getDb } from "@/lib/db";

/** POST /api/generate-social?topicId= — generate social posts from saved blog (Review page button). */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const topicIdParam = searchParams.get("topicId");
    const topicId = topicIdParam ? parseInt(topicIdParam, 10) : NaN;

    if (Number.isNaN(topicId) || topicId < 1) {
      return NextResponse.json(
        { error: "Valid topicId is required" },
        { status: 400 }
      );
    }

    const db = await getDb();
    const raw = await db
      .prepare("SELECT blog_html FROM Content WHERE topic_id = ?")
      .get(topicId);
    const row = raw as unknown as { blog_html?: string | null } | undefined;
    const blog_html = row?.blog_html ?? "";
    if (!blog_html || !blog_html.trim()) {
      return NextResponse.json(
        { error: "No blog found for this topic. Generate the blog first." },
        { status: 400 }
      );
    }

    const {
      linkedin_post,
      instagram_post,
      twitter_post,
      linkedin_posts,
      twitter_posts,
      instagram_posts,
    } = await generateSocialMedia(blog_html);

    const liCopy = linkedin_posts?.length ? linkedin_posts : [linkedin_post];
    const twCopy = twitter_posts?.length ? twitter_posts : [twitter_post];
    const igCopy = instagram_posts?.length ? instagram_posts : [instagram_post];

    try {
      await db.prepare(
        `UPDATE Content
         SET linkedin_copy = ?, twitter_copy = ?, facebook_copy = ?
         WHERE topic_id = ?`
      ).run(JSON.stringify(liCopy), JSON.stringify(twCopy), JSON.stringify(igCopy), topicId);
    } catch {
      // DB may be stub; still return content so UI can update
    }

    const content = {
      linkedinPost: liCopy[0] ?? "",
      linkedin_copy: liCopy,
      twitterPost: twCopy[0] ?? "",
      twitter_copy: twCopy,
      instagramPost: igCopy[0] ?? "",
      instagram_copy: igCopy,
    };
    return NextResponse.json({ ok: true, content });
  } catch (e) {
    console.error("POST /api/generate-social", e);
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("429") || message.toLowerCase().includes("too many requests")) {
      return NextResponse.json(
        {
          error:
            "Gemini rate limit exceeded (429). The request was retried with backoff. Please wait and try again.",
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: message || "Social generation failed" },
      { status: 500 }
    );
  }
}

