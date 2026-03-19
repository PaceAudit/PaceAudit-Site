import { NextResponse } from "next/server";
import { getDb, useTurso } from "@/lib/db";
import { readTopics } from "@/lib/topics-store";

type ContentRow = {
  id: number;
  topic_id: number;
  blog_html?: string | null;
  blogHtml?: string | null;
  meta_description?: string | null;
  metaDescription?: string | null;
  seo_tags?: string | null;
  seoTags?: string | null;
  linkedin_copy?: string | null;
  linkedinPost?: string | null;
  twitter_copy?: string | null;
  twitterPost?: string | null;
  facebook_copy?: string | null;
  instagramPost?: string | null;
  image_url: string | null;
  linkedin_image_urls?: string | null;
  instagram_image_urls?: string | null;
  scheduled_date: string | null;
  published_date: string | null;
  status: string | null;
  linkedin_posted_indices?: string | null;
  twitter_posted_indices?: string | null;
  instagram_posted_indices?: string | null;
};

function parseImageUrlsJson(raw: string | null | undefined): string[] {
  if (raw == null || typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function parsePostedIndices(raw: string | null | undefined): number[] {
  if (raw == null || typeof raw !== "string" || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "number" && Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

/** Extract flat strings from Content row. Handles linkedin_copy (JSON array) or plain string. */
function toLinkedinCopy(r: ContentRow): string[] {
  const flat = (r as Record<string, unknown>).linkedin_post ?? r.linkedinPost;
  if (typeof flat === "string" && flat.trim()) return [flat.trim()];
  const raw = r.linkedin_copy?.trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((p: unknown) => typeof p === "string").slice(0, 3) : [];
  } catch {
    return raw ? [raw] : [];
  }
}

function toTwitterCopy(r: ContentRow): string[] {
  const flat = (r as Record<string, unknown>).twitter_post ?? r.twitterPost;
  if (typeof flat === "string" && flat.trim()) return [flat.trim()];
  const raw = r.twitter_copy?.trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((p: unknown) => typeof p === "string").slice(0, 6) : [];
  } catch {
    return raw ? [raw] : [];
  }
}

function toInstagramCopy(r: ContentRow): string[] {
  const flat = (r as Record<string, unknown>).instagram_post ?? r.instagramPost;
  if (typeof flat === "string" && flat.trim()) return [flat.trim()];
  const raw = r.facebook_copy?.trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((p: unknown) => typeof p === "string").slice(0, 3) : raw ? [raw] : [];
  } catch {
    return raw ? [raw] : [];
  }
}

function toSeoTags(r: ContentRow): string[] {
  const raw = (r.seoTags ?? r.seo_tags)?.trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown[];
    return arr.filter((t): t is string => typeof t === "string");
  } catch {
    return [];
  }
}

/** GET ?topicId= — content for one topic. GET ?status=review — content for topics with status Review. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const topicIdParam = searchParams.get("topicId");
    const statusFilter = searchParams.get("status");

    const db = await getDb();

    if (topicIdParam) {
      const topicId = parseInt(topicIdParam, 10);
      if (Number.isNaN(topicId)) {
        return NextResponse.json(
          { error: "Invalid topicId" },
          { status: 400 }
        );
      }
      const raw = await db
        .prepare(
          "SELECT id, topic_id, blog_html, meta_description, seo_tags, linkedin_copy, twitter_copy, facebook_copy, image_url, linkedin_image_urls, instagram_image_urls, scheduled_date, published_date, status, linkedin_posted_indices, twitter_posted_indices, instagram_posted_indices FROM Content WHERE topic_id = ?"
        )
        .get(topicId);
      const row = raw as unknown as ContentRow | undefined;

      if (!row) {
        return NextResponse.json(null);
      }

      const blogHtml = (row.blogHtml ?? row.blog_html ?? "") as string;
      const metaDescription = (row.metaDescription ?? row.meta_description ?? "") as string;
      const linkedinCopy = toLinkedinCopy(row);
      const twitterCopy = toTwitterCopy(row);
      const instagramCopy = toInstagramCopy(row);
      const seoTags = toSeoTags(row);
      const linkedinImageUrls = parseImageUrlsJson(row.linkedin_image_urls);
      const instagramImageUrls = parseImageUrlsJson(row.instagram_image_urls);

      return NextResponse.json({
        id: row.id,
        topic_id: row.topic_id,
        blogHtml,
        blog_html: blogHtml,
        metaDescription,
        meta_description: metaDescription || null,
        seoTags,
        seo_tags: seoTags,
        linkedinPost: linkedinCopy[0] ?? "",
        linkedin_copy: linkedinCopy,
        twitterPost: twitterCopy[0] ?? "",
        twitter_copy: twitterCopy,
        instagramPost: instagramCopy[0] ?? "",
        instagram_copy: instagramCopy,
        facebook_copy: instagramCopy[0] ?? "",
        image_url: row.image_url ?? null,
        linkedin_image_urls: linkedinImageUrls,
        instagram_image_urls: instagramImageUrls,
        scheduled_date: row.scheduled_date ?? null,
        published_date: row.published_date ?? null,
        status: row.status ?? "Draft",
        linkedin_posted_indices: parsePostedIndices(row.linkedin_posted_indices),
        twitter_posted_indices: parsePostedIndices(row.twitter_posted_indices),
        instagram_posted_indices: parsePostedIndices(row.instagram_posted_indices),
      });
    }

    if (statusFilter === "review") {
      let rows: ContentRow[];
      const joinRows = (await db
        .prepare(
          `SELECT c.id, c.topic_id, c.blog_html, c.meta_description, c.seo_tags, c.linkedin_copy, c.twitter_copy, c.facebook_copy, c.image_url, c.linkedin_image_urls, c.instagram_image_urls, c.scheduled_date, c.published_date, c.status, c.linkedin_posted_indices, c.twitter_posted_indices, c.instagram_posted_indices
           FROM Content c
           INNER JOIN Topics t ON t.id = c.topic_id
           WHERE t.status = 'Review'
           ORDER BY c.id DESC`
        )
        .all()) as ContentRow[];
      if (joinRows.length > 0) {
        rows = joinRows;
      } else {
        let reviewIds: number[];
        if (useTurso()) {
          const topicRows = (await db.prepare("SELECT id FROM Topics WHERE status = 'Review'").all()) as { id: number }[];
          reviewIds = topicRows.map((r) => r.id);
        } else {
          const fileTopics = readTopics();
          reviewIds = fileTopics.filter((t) => t.status === "Review").map((t) => t.id);
        }
        if (reviewIds.length === 0) return NextResponse.json([]);
        const placeholders = reviewIds.map(() => "?").join(",");
        rows = (await db
          .prepare(
            `SELECT id, topic_id, blog_html, meta_description, seo_tags, linkedin_copy, twitter_copy, facebook_copy, image_url, linkedin_image_urls, instagram_image_urls, scheduled_date, published_date, status, linkedin_posted_indices, twitter_posted_indices, instagram_posted_indices
             FROM Content
             WHERE topic_id IN (${placeholders})
             ORDER BY id DESC`
          )
          .all(...reviewIds)) as ContentRow[];
      }

      const items = rows.map((r) => {
        const blogHtml = (r.blogHtml ?? r.blog_html ?? "") as string;
        const metaDescription = (r.metaDescription ?? r.meta_description ?? "") as string;
        const linkedinCopy = toLinkedinCopy(r);
        const twitterCopy = toTwitterCopy(r);
        const instagramCopy = toInstagramCopy(r);
        const seoTags = toSeoTags(r);
        const linkedinImageUrls = parseImageUrlsJson(r.linkedin_image_urls);
        const instagramImageUrls = parseImageUrlsJson(r.instagram_image_urls);
        return {
          id: r.id,
          topic_id: r.topic_id,
          blogHtml,
          blog_html: blogHtml,
          metaDescription,
          meta_description: metaDescription || null,
          seoTags,
          seo_tags: seoTags,
          linkedinPost: linkedinCopy[0] ?? "",
          linkedin_copy: linkedinCopy,
          twitterPost: twitterCopy[0] ?? "",
          twitter_copy: twitterCopy,
          instagramPost: instagramCopy[0] ?? "",
          instagram_copy: instagramCopy,
          facebook_copy: instagramCopy[0] ?? "",
          image_url: r.image_url ?? null,
          linkedin_image_urls: linkedinImageUrls,
          instagram_image_urls: instagramImageUrls,
          scheduled_date: r.scheduled_date ?? null,
          published_date: r.published_date ?? null,
          status: r.status ?? "Draft",
          linkedin_posted_indices: parsePostedIndices(r.linkedin_posted_indices),
          twitter_posted_indices: parsePostedIndices(r.twitter_posted_indices),
          instagram_posted_indices: parsePostedIndices(r.instagram_posted_indices),
        };
      });

      return NextResponse.json(items);
    }

    return NextResponse.json(
      { error: "Provide topicId or status=review" },
      { status: 400 }
    );
  } catch (e) {
    console.error("GET /api/content", e);
    return NextResponse.json(
      { error: "Failed to load content" },
      { status: 500 }
    );
  }
}

/** POST — create or update content for a topic (upsert by topic_id). */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const topic_id = parseInt(body.topic_id, 10);
    if (Number.isNaN(topic_id)) {
      return NextResponse.json(
        { error: "topic_id is required" },
        { status: 400 }
      );
    }
    const blog_html = typeof body.blog_html === "string" ? body.blog_html : "";
    const linkedin_copy = Array.isArray(body.linkedin_copy)
      ? JSON.stringify(body.linkedin_copy)
      : "[]";
    const twitter_copy = Array.isArray(body.twitter_copy)
      ? JSON.stringify(body.twitter_copy)
      : "[]";
    const facebook_copy = Array.isArray(body.instagram_copy)
      ? JSON.stringify(body.instagram_copy)
      : typeof body.facebook_copy === "string"
        ? body.facebook_copy
        : null;
    const image_url =
      typeof body.image_url === "string" ? body.image_url : null;
    const linkedin_image_urls = Array.isArray(body.linkedin_image_urls)
      ? JSON.stringify(body.linkedin_image_urls.filter((x: unknown) => typeof x === "string").slice(0, 3))
      : "[]";
    const instagram_image_urls = Array.isArray(body.instagram_image_urls)
      ? JSON.stringify(body.instagram_image_urls.filter((x: unknown) => typeof x === "string").slice(0, 3))
      : "[]";
    const scheduled_date =
      typeof body.scheduled_date === "string" ? body.scheduled_date : null;
    const status =
      body.status === "Scheduled" || body.status === "Published"
        ? body.status
        : "Draft";
    const meta_description =
      typeof body.meta_description === "string" ? body.meta_description : null;
    const seo_tags =
      typeof body.seo_tags === "string"
        ? body.seo_tags
        : Array.isArray(body.seo_tags)
          ? body.seo_tags.filter((x: unknown) => typeof x === "string").join(", ")
          : null;

    const db = await getDb();
    const existingRaw = await db
      .prepare("SELECT id FROM Content WHERE topic_id = ?")
      .get(topic_id);
    const existing = existingRaw as unknown as { id: number } | undefined;

    if (existing) {
      await db.prepare(
        `UPDATE Content SET blog_html = ?, meta_description = ?, seo_tags = ?, linkedin_copy = ?, twitter_copy = ?, facebook_copy = ?, image_url = ?, linkedin_image_urls = ?, instagram_image_urls = ?, scheduled_date = ?, status = ? WHERE topic_id = ?`
      ).run(blog_html, meta_description, seo_tags, linkedin_copy, twitter_copy, facebook_copy, image_url, linkedin_image_urls, instagram_image_urls, scheduled_date, status, topic_id);
    } else {
      await db.prepare(
        `INSERT INTO Content (topic_id, blog_html, meta_description, seo_tags, linkedin_copy, twitter_copy, facebook_copy, image_url, linkedin_image_urls, instagram_image_urls, scheduled_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(topic_id, blog_html, meta_description, seo_tags, linkedin_copy, twitter_copy, facebook_copy, image_url, linkedin_image_urls, instagram_image_urls, scheduled_date, status);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/content", e);
    return NextResponse.json(
      { error: "Failed to save content" },
      { status: 500 }
    );
  }
}
