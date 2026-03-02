import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type ContentRow = {
  id: number;
  topic_id: number;
  blog_html: string | null;
  linkedin_copy: string | null;
  twitter_copy: string | null;
  facebook_copy: string | null;
  image_url: string | null;
  scheduled_date: string | null;
  published_date: string | null;
  status: string | null;
};

/** GET ?topicId= — content for one topic. GET ?status=review — content for topics with status Review. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const topicIdParam = searchParams.get("topicId");
    const statusFilter = searchParams.get("status");

    const db = getDb();

    if (topicIdParam) {
      const topicId = parseInt(topicIdParam, 10);
      if (Number.isNaN(topicId)) {
        return NextResponse.json(
          { error: "Invalid topicId" },
          { status: 400 }
        );
      }
      const raw = db
        .prepare(
          "SELECT id, topic_id, blog_html, linkedin_copy, twitter_copy, facebook_copy, image_url, scheduled_date, published_date, status FROM Content WHERE topic_id = ?"
        )
        .get(topicId);
      const row = raw as unknown as ContentRow | undefined;

      if (!row) {
        return NextResponse.json(null);
      }

      return NextResponse.json({
        id: row.id,
        topic_id: row.topic_id,
        blog_html: row.blog_html ?? "",
        linkedin_copy: row.linkedin_copy
          ? JSON.parse(row.linkedin_copy)
          : [],
        twitter_copy: row.twitter_copy
          ? JSON.parse(row.twitter_copy)
          : [],
        facebook_copy: row.facebook_copy ?? "",
        image_url: row.image_url ?? null,
        scheduled_date: row.scheduled_date ?? null,
        published_date: row.published_date ?? null,
        status: row.status ?? "Draft",
      });
    }

    if (statusFilter === "review") {
      const rows = db
        .prepare(
          `SELECT c.id, c.topic_id, c.blog_html, c.linkedin_copy, c.twitter_copy, c.facebook_copy, c.image_url, c.scheduled_date, c.published_date, c.status
           FROM Content c
           INNER JOIN Topics t ON t.id = c.topic_id
           WHERE t.status = 'Review'
           ORDER BY c.id DESC`
        )
        .all() as ContentRow[];

      const items = rows.map((r) => ({
        id: r.id,
        topic_id: r.topic_id,
        blog_html: r.blog_html ?? "",
        linkedin_copy: r.linkedin_copy
          ? JSON.parse(r.linkedin_copy)
          : [],
        twitter_copy: r.twitter_copy ? JSON.parse(r.twitter_copy) : [],
        facebook_copy: r.facebook_copy ?? "",
        image_url: r.image_url ?? null,
        scheduled_date: r.scheduled_date ?? null,
        published_date: r.published_date ?? null,
        status: r.status ?? "Draft",
      }));

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
    const facebook_copy =
      typeof body.facebook_copy === "string" ? body.facebook_copy : null;
    const image_url =
      typeof body.image_url === "string" ? body.image_url : null;
    const scheduled_date =
      typeof body.scheduled_date === "string" ? body.scheduled_date : null;
    const status =
      body.status === "Scheduled" || body.status === "Published"
        ? body.status
        : "Draft";

    const db = getDb();
    const existingRaw = db
      .prepare("SELECT id FROM Content WHERE topic_id = ?")
      .get(topic_id);
    const existing = existingRaw as unknown as { id: number } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE Content SET blog_html = ?, linkedin_copy = ?, twitter_copy = ?, facebook_copy = ?, image_url = ?, scheduled_date = ?, status = ? WHERE topic_id = ?`
      ).run(blog_html, linkedin_copy, twitter_copy, facebook_copy, image_url, scheduled_date, status, topic_id);
    } else {
      db.prepare(
        `INSERT INTO Content (topic_id, blog_html, linkedin_copy, twitter_copy, facebook_copy, image_url, scheduled_date, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(topic_id, blog_html, linkedin_copy, twitter_copy, facebook_copy, image_url, scheduled_date, status);
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
