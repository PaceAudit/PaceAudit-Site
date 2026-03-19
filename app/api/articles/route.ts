import { NextResponse } from "next/server";
import { getDb, useTurso } from "@/lib/db";

/**
 * GET /api/articles
 * Returns the list of published articles and the base URL for linking (SITE_URL).
 *
 * Publishing is buildless to Netlify (uploads `articles/{slug}.html`), so we list from the DB to avoid
 * relying on GitHub directory listings.
 */
export async function GET() {
  try {
    const baseUrl = process.env.SITE_URL ?? "https://www.paceaudit.com";

    // Prefer DB listing (stable and source-of-truth for what's published).
    if (useTurso()) {
      const db = await getDb();
      const rows = (await db.prepare(
        `SELECT t.title
         FROM Topics t
         INNER JOIN Content c ON c.topic_id = t.id
         WHERE t.status = 'Published'
           AND c.status = 'Published'
         ORDER BY COALESCE(c.published_date, '') DESC, t.id DESC`
      ).all()) as { title?: string }[];
      const slugs = rows
        .map((r) => String(r.title ?? "").trim())
        .filter(Boolean)
        .map((title) =>
          title
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "post"
        );
      const unique = [...new Set(slugs)].map((slug) => ({ slug }));
      return NextResponse.json({ articles: unique, baseUrl });
    }

    // If DB isn't configured (stub), return an empty list but still provide baseUrl.
    return NextResponse.json({ articles: [], baseUrl, error: "Database not configured (Turso) — cannot list published articles" }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { articles: [], baseUrl: process.env.SITE_URL ?? "https://www.paceaudit.com", error: message },
      { status: 200 }
    );
  }
}
