import { NextResponse } from "next/server";
import { getDb, useTurso } from "@/lib/db";
import { readTopics } from "@/lib/topics-store";

type TopicRow = {
  id: number;
  title: string;
  keyword: string | null;
  angle: string | null;
  persona: string | null;
  status: string;
  topic_tag?: string | null;
  intent_arc?: string | null;
  blog_html?: string | null;
  meta_description?: string | null;
  seo_tags?: string | null;
  linkedin_copy?: string | null;
  twitter_copy?: string | null;
  facebook_copy?: string | null;
  image_url?: string | null;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    if (useTurso()) {
      const db = await getDb();
      let rows: TopicRow[];
      if (status) {
        rows = (await db.prepare(
        `SELECT t.id, t.title, t.keyword, t.angle, t.persona, t.status, t.topic_tag, t.intent_arc,
                c.blog_html, c.meta_description, c.seo_tags, c.linkedin_copy, c.twitter_copy, c.facebook_copy, c.image_url
         FROM Topics t
         LEFT JOIN Content c ON c.topic_id = t.id
         WHERE t.status = ?
         ORDER BY t.id DESC`
      ).all(status)) as TopicRow[];
      } else {
        rows = (await db.prepare(
          `SELECT t.id, t.title, t.keyword, t.angle, t.persona, t.status, t.topic_tag, t.intent_arc,
                  c.blog_html, c.meta_description, c.seo_tags, c.linkedin_copy, c.twitter_copy, c.facebook_copy, c.image_url
           FROM Topics t
           LEFT JOIN Content c ON c.topic_id = t.id
           ORDER BY t.id DESC`
        ).all()) as TopicRow[];
      }

    const parseFlat = (raw: string | null | undefined, fallback = ""): string => {
      if (raw == null || raw === "") return fallback;
      try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) && typeof arr[0] === "string" ? arr[0] : raw;
      } catch {
        return typeof raw === "string" ? raw : fallback;
      }
    };

      const topics = rows.map((r) => ({
      id: r.id,
      title: r.title,
      keyword: r.keyword ?? "",
      angle: r.angle ?? "",
      persona: r.persona ?? "",
      status: r.status,
      topic_tag: r.topic_tag ?? "",
      intent_arc: r.intent_arc ?? "",
      blogHtml: (r.blog_html ?? "") as string,
      metaDescription: (r.meta_description ?? "") as string,
      seoTags: (() => {
        try {
          const parsed = JSON.parse((r.seo_tags ?? "[]") as string);
          return Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === "string").join(", ") : (r.seo_tags ?? "") as string;
        } catch {
          return (r.seo_tags ?? "") as string;
        }
      })(),
      linkedinPost: parseFlat(r.linkedin_copy),
      twitterPost: parseFlat(r.twitter_copy),
      instagramPost: parseFlat(r.facebook_copy),
      imageUrl: (r.image_url ?? null) as string | null,
      image_url: (r.image_url ?? null) as string | null,
      }));

      return NextResponse.json(topics);
    }

    const fileTopics = readTopics();
    if (fileTopics.length > 0) {
      const list = status
        ? fileTopics.filter((t) => t.status === status)
        : fileTopics;
      return NextResponse.json(list);
    }

    const db = await getDb();
    let rows: TopicRow[];
    if (status) {
      rows = (await db.prepare(
        `SELECT t.id, t.title, t.keyword, t.angle, t.persona, t.status, t.topic_tag, t.intent_arc,
                c.blog_html, c.meta_description, c.seo_tags, c.linkedin_copy, c.twitter_copy, c.facebook_copy, c.image_url
         FROM Topics t
         LEFT JOIN Content c ON c.topic_id = t.id
         WHERE t.status = ?
         ORDER BY t.id DESC`
      ).all(status)) as TopicRow[];
    } else {
      rows = (await db.prepare(
        `SELECT t.id, t.title, t.keyword, t.angle, t.persona, t.status, t.topic_tag, t.intent_arc,
         c.blog_html, c.meta_description, c.seo_tags, c.linkedin_copy, c.twitter_copy, c.facebook_copy, c.image_url
         FROM Topics t
         LEFT JOIN Content c ON c.topic_id = t.id
         ORDER BY t.id DESC`
      ).all()) as TopicRow[];
    }

    const topics = rows.map((r) => ({
      id: r.id,
      title: r.title,
      keyword: r.keyword ?? "",
      angle: r.angle ?? "",
      persona: r.persona ?? "",
      status: r.status,
      topic_tag: r.topic_tag ?? "",
      intent_arc: r.intent_arc ?? "",
      blogHtml: (r.blog_html ?? "") as string,
      metaDescription: (r.meta_description ?? "") as string,
      seoTags: (() => {
        try {
          const parsed = JSON.parse((r.seo_tags ?? "[]") as string);
          return Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === "string").join(", ") : (r.seo_tags ?? "") as string;
        } catch {
          return (r.seo_tags ?? "") as string;
        }
      })(),
      linkedinPost: parseFlat(r.linkedin_copy),
      twitterPost: parseFlat(r.twitter_copy),
      instagramPost: parseFlat(r.facebook_copy),
      imageUrl: (r.image_url ?? null) as string | null,
      image_url: (r.image_url ?? null) as string | null,
    }));

    return NextResponse.json(topics);
  } catch (e) {
    console.error("GET /api/topics", e);
    return NextResponse.json(
      { error: "Failed to load topics" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }
    const keyword = typeof body.keyword === "string" ? body.keyword : "";
    const angle = typeof body.angle === "string" ? body.angle : "";
    const persona = typeof body.persona === "string" ? body.persona : "";
    const topic_tag = typeof body.topic_tag === "string" ? body.topic_tag : "";
    const intent_arc = typeof body.intent_arc === "string" ? body.intent_arc : "";
    const status = "Pending";

    if (useTurso()) {
      const db = await getDb();
      const maxRow = (await db.prepare("SELECT COALESCE(MAX(id), 0) as m FROM Topics").get()) as { m?: number } | undefined;
      const nextId = (maxRow?.m ?? 0) + 1;
      await db.prepare(
        "INSERT INTO Topics (id, title, keyword, angle, persona, status, topic_tag, intent_arc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).run(nextId, title, keyword, angle, persona, status, topic_tag || null, intent_arc || null);

      return NextResponse.json({
        id: nextId,
        title,
        keyword,
        angle,
        persona,
        topic_tag,
        intent_arc,
        status,
      });
    }

    const { addTopic } = await import("@/lib/topics-store");
    const newTopic = addTopic({
      title,
      keyword,
      angle,
      persona,
      status,
      topic_tag: topic_tag || undefined,
      intent_arc: intent_arc || undefined,
    });

    return NextResponse.json({
      id: newTopic.id,
      title: newTopic.title,
      keyword: newTopic.keyword ?? "",
      angle: newTopic.angle ?? "",
      persona: newTopic.persona ?? "",
      topic_tag: newTopic.topic_tag ?? "",
      intent_arc: newTopic.intent_arc ?? "",
      status: newTopic.status,
    });
  } catch (e) {
    console.error("POST /api/topics", e);
    return NextResponse.json(
      { error: "Failed to create topic" },
      { status: 500 }
    );
  }
}
