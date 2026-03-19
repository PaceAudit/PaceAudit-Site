import { buildBlogPostHtml } from "@/lib/blog-template";
import { deployFileToNetlify } from "@/lib/netlify-deploy";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "post";
}

type PostRow = {
  id: number;
  title: string;
  topic_id: number;
  content_id: number;
  blog_html: string | null;
  meta_description: string | null;
  seo_tags: string | null;
  image_url: string | null;
};

export type PublishResult = {
  ok: boolean;
  published: number;
  total: number;
  errors?: string[];
};

/**
 * Publish approved blog posts to Netlify (buildless deploy). Runs on cron (only due items) or on demand (all approved).
 *
 * This avoids Netlify build minutes/credits by uploading only the generated `articles/{slug}.html` files.
 */
export async function runPublishToGithub(options?: { immediate?: boolean }): Promise<PublishResult> {
  const { getDb } = await import("@/lib/db");

  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);

  const sql = options?.immediate
    ? `SELECT t.id, t.title, t.id AS topic_id, c.id AS content_id, c.blog_html, c.meta_description, c.seo_tags, c.image_url
       FROM Topics t
       INNER JOIN Content c ON c.topic_id = t.id
       WHERE t.status = 'Approved'
         AND c.scheduled_date IS NOT NULL
         AND (c.blog_html IS NOT NULL AND trim(c.blog_html) != '')
       ORDER BY c.scheduled_date ASC`
    : `SELECT t.id, t.title, t.id AS topic_id, c.id AS content_id, c.blog_html, c.meta_description, c.seo_tags, c.image_url
       FROM Topics t
       INNER JOIN Content c ON c.topic_id = t.id
       WHERE t.status = 'Approved'
         AND c.scheduled_date IS NOT NULL
         AND (date(c.scheduled_date) <= date(?) OR substr(c.scheduled_date, 1, 10) <= ?)`;

  const rows = (options?.immediate ? await db.prepare(sql).all() : await db.prepare(sql).all(today, today)) as PostRow[];

  let published = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const slug = slugify(row.title);
    const path = `articles/${slug}.html`;
    const html = buildBlogPostHtml({
      title: row.title,
      metaDescription: row.meta_description ?? null,
      seoTags: row.seo_tags ?? null,
      blogHtml: row.blog_html ?? "",
      imageUrl: row.image_url ?? null,
      blogDate: null,
    });

    const netlifyRes = await deployFileToNetlify({
      filePath: path,
      content: html,
      contentType: "text/html; charset=utf-8",
    });

    if (!netlifyRes.ok) {
      errors.push(`${row.title}: ${netlifyRes.error ?? "Netlify publish failed"}`);
      continue;
    }

    const now = new Date().toISOString();
    await db.prepare("UPDATE Content SET status = 'Published', published_date = ? WHERE id = ?").run(now, row.content_id);
    await db.prepare("UPDATE Topics SET status = 'Published' WHERE id = ?").run(row.topic_id);
    published++;
  }

  return {
    ok: true,
    published,
    total: rows.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}
