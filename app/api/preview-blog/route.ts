import { NextRequest, NextResponse } from "next/server";
import { buildBlogPostHtml } from "@/lib/blog-template";

/**
 * POST /api/preview-blog
 * Accepts { title, metaDescription, seoTags, blogHtml, imageUrl?, blogDate? }
 * Returns full HTML document for preview (uses index-sample.html template).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "Untitled Post";
    const metaDescription =
      typeof body.metaDescription === "string" ? body.metaDescription : null;
    const seoTags = typeof body.seoTags === "string" ? body.seoTags : null;
    const blogHtml = typeof body.blogHtml === "string" ? body.blogHtml : "";
    const imageUrl =
      typeof body.imageUrl === "string" && body.imageUrl.trim()
        ? body.imageUrl.trim()
        : null;
    const blogDate =
      typeof body.blogDate === "string" && body.blogDate.trim()
        ? body.blogDate.trim()
        : null;

    const html = buildBlogPostHtml({
      title: title || "Untitled Post",
      metaDescription,
      seoTags,
      blogHtml,
      imageUrl,
      blogDate,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[preview-blog]", message);
    return NextResponse.json(
      { error: "Failed to build preview" },
      { status: 500 }
    );
  }
}
