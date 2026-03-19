import { NextResponse } from "next/server";
import { deployFileToNetlify } from "@/lib/netlify-deploy";

/**
 * POST /api/publish-now
 * Accepts blog payload (title, slug, htmlContent, imageUrl), builds a standalone HTML page,
 * and deploys it to Netlify at articles/{slug}.html (buildless; no rebuild).
 */
export async function POST(request: Request) {
  try {
    let body: { title?: string; slug?: string; htmlContent?: string; imageUrl?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body. Expected { title, slug, htmlContent, imageUrl }." },
        { status: 400 }
      );
    }
    const { title, slug, htmlContent, imageUrl } = body;
    const slugStr = slug != null && String(slug).trim() ? String(slug).trim() : null;
    if (!slugStr) {
      return NextResponse.json(
        { error: "Missing or empty 'slug' in body. Use a URL-safe string (e.g. my-blog-post)." },
        { status: 400 }
      );
    }

    const imageBlock =
      imageUrl && String(imageUrl).trim()
        ? `<figure style="margin:0 0 1.5rem 0;"><img src="${String(imageUrl).replace(/"/g, "&quot;")}" alt="${String(title ?? "").replace(/"/g, "&quot;")}" style="width:100%;height:auto;display:block;border-radius:8px;" /></figure>`
        : "";

    const fullHtmlString = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${String(title ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</title>
</head>
<body>
  <main>
    ${imageBlock}
    ${htmlContent ?? ""}
  </main>
</body>
</html>`;

    const base64Content = Buffer.from(fullHtmlString, "utf8").toString("base64");
    void base64Content; // legacy variable kept to minimize diff; safe to remove later

    const netlifyRes = await deployFileToNetlify({
      filePath: `articles/${slugStr}.html`,
      content: fullHtmlString,
      contentType: "text/html; charset=utf-8",
    });
    if (!netlifyRes.ok) {
      return NextResponse.json({ error: netlifyRes.error ?? "Netlify publish failed" }, { status: 500 });
    }

    return new NextResponse(null, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
