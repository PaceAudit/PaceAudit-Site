import { readFileSync } from "fs";
import { join } from "path";
import { marked } from "marked";

// Use marked for Markdown→HTML; disable raw HTML for safety
marked.setOptions({ gfm: true, breaks: true });

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build the blog article main content to inject into the template.
 */
function buildBlogMainContent(
  title: string,
  blogDate: string | null,
  imageUrl: string | null,
  htmlContent: string
): string {
  const safeTitle = escapeHtml(title);
  const dateStr = blogDate
    ? new Date(blogDate + "T12:00:00").toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const imageBlock =
    imageUrl && imageUrl.startsWith("http")
      ? `<figure style="margin:2rem 0;border-radius:12px;overflow:hidden;"><img src="${escapeHtml(imageUrl)}" alt="${safeTitle}" style="width:100%;height:auto;display:block;" /></figure>`
      : imageUrl && imageUrl.startsWith("data:")
        ? `<figure style="margin:2rem 0;border-radius:12px;overflow:hidden;"><img src="${imageUrl}" alt="${safeTitle}" style="width:100%;height:auto;display:block;" /></figure>`
        : "";

  // Convert Markdown to HTML (blogHtml may already be HTML from PaceAudit generator)
  const renderedContent =
    typeof htmlContent === "string" && htmlContent.trim()
      ? (htmlContent.trim().startsWith("<")
          ? htmlContent.trim()
          : String(marked.parse(htmlContent)))
      : "";

  return `<main id="main-content">
<a href="/articles" class="back-to-main">← Back to Pulse Articles</a>
<!-- BLOG ARTICLE -->
<article class="blog-article" style="padding:6rem 4rem 2rem;">
  <div class="section-inner" style="max-width:800px;margin:0 auto;">
    <header style="margin-bottom:2rem;">
      <h1 class="section-title" style="font-size:clamp(1.8rem,3vw,2.6rem);margin-bottom:0.5rem;">${safeTitle}</h1>
      ${dateStr ? `<time style="font-size:0.9rem;color:var(--text3);" datetime="${escapeHtml(blogDate ?? "")}">${escapeHtml(dateStr)}</time>` : ""}
      ${imageBlock}
    </header>
    <div class="blog-content" style="font-size:1rem;line-height:1.8;color:var(--text);">
      ${renderedContent}
    </div>
  </div>
</article>
</main>`;
}

export type BlogTemplateInput = {
  title: string;
  metaDescription?: string | null;
  seoTags?: string | null;
  blogHtml: string;
  imageUrl?: string | null;
  blogDate?: string | null;
};

/**
 * Build full HTML for a blog post using index-sample.html as the base template.
 * Replaces title/meta in head and main content with the blog article.
 */
export function buildBlogPostHtml(input: BlogTemplateInput): string {
  const {
    title,
    metaDescription = null,
    seoTags = null,
    blogHtml,
    imageUrl = null,
    blogDate = null,
  } = input;

  const metaDesc = (metaDescription || title).trim();
  const keywords = (seoTags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .join(", ");
  const safeTitle = escapeHtml(title);
  const safeMetaDesc = escapeHtml(metaDesc);
  const safeKeywords = escapeHtml(keywords);
  const safeImageUrl =
    imageUrl && (imageUrl.startsWith("http") || imageUrl.startsWith("data:"))
      ? imageUrl.replace(/"/g, "&quot;")
      : null;

  const templatePath = join(process.cwd(), "index-sample.html");
  let html: string;
  try {
    html = readFileSync(templatePath, "utf8");
  } catch {
    // Fallback minimal HTML if template missing
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head>
<body><main><h1>${safeTitle}</h1><div>${blogHtml || ""}</div></main></body></html>`;
  }

  // Replace title
  html = html.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${safeTitle}</title>`
  );

  // Replace meta description
  html = html.replace(
    /<meta name="description" content="[^"]*"/i,
    `<meta name="description" content="${safeMetaDesc}"`
  );

  // Replace keywords
  html = html.replace(
    /<meta name="keywords" content="[^"]*"/i,
    `<meta name="keywords" content="${safeKeywords}"`
  );

  // Replace og:title
  html = html.replace(
    /<meta property="og:title" content="[^"]*"/i,
    `<meta property="og:title" content="${safeTitle}"`
  );

  // Replace og:description
  html = html.replace(
    /<meta property="og:description" content="[^"]*"/i,
    `<meta property="og:description" content="${safeMetaDesc}"`
  );

  // Replace og:image if we have one
  if (safeImageUrl) {
    html = html.replace(
      /<meta property="og:image" content="[^"]*"/i,
      `<meta property="og:image" content="${safeImageUrl}"`
    );
  }

  // Replace og:type for article
  html = html.replace(
    /<meta property="og:type" content="[^"]*"/i,
    `<meta property="og:type" content="article"`
  );

  // Ensure nav-pro.css, fonts, nav-pro.js exist; inject back-to-main CSS
  if (!html.includes('nav-pro.css')) {
    html = html.replace(/<\/head>/i, '<link rel="stylesheet" href="css/nav-pro.css">\n</head>');
  }
  if (!html.includes('fonts.googleapis.com')) {
    html = html.replace(/<\/head>/i, '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=optional" rel="stylesheet">\n</head>');
  }
  if (!html.includes('nav-pro.js')) {
    html = html.replace(/<\/body>/i, '<script src="js/nav-pro.js"></script>\n</body>');
  }
  const backToMainStyles = `<style id="blog-back-to-main">.back-to-main{display:block;margin-top:68px;padding:.5rem 4rem;background:var(--bg2,#f8f9fa);border-bottom:1px solid var(--border,#e8eaed);color:var(--text2,#4a5568);font-size:.875rem;text-decoration:none;transition:color .18s}.back-to-main:hover{color:var(--orange,#e8622a)}@media(max-width:1000px){.back-to-main{padding:.5rem 1.5rem}}</style>`;
  if (!html.includes('blog-back-to-main')) {
    html = html.replace(/<\/head>/i, backToMainStyles + '\n</head>');
  }

  // Replace main content: from <main id="main-content"> to </main>
  const mainRegex = /<main\s+id="main-content"[\s\S]*?<\/main>/i;
  const newMain = buildBlogMainContent(title, blogDate, imageUrl, blogHtml);
  html = html.replace(mainRegex, newMain);

  return html;
}
