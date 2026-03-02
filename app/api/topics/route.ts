import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type TopicRow = {
  id: number;
  title: string;
  keyword: string | null;
  angle: string | null;
  persona: string | null;
  status: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");

    const db = getDb();
    let rows: TopicRow[];
    if (status) {
      rows = db.prepare(
        "SELECT id, title, keyword, angle, persona, status FROM Topics WHERE status = ? ORDER BY id DESC"
      ).all(status) as TopicRow[];
    } else {
      rows = db.prepare(
        "SELECT id, title, keyword, angle, persona, status FROM Topics ORDER BY id DESC"
      ).all() as TopicRow[];
    }

    const topics = rows.map((r) => ({
      id: r.id,
      title: r.title,
      keyword: r.keyword ?? "",
      angle: r.angle ?? "",
      persona: r.persona ?? "",
      status: r.status,
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
    const status = "Pending";

    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO Topics (title, keyword, angle, persona, status) VALUES (?, ?, ?, ?, ?)`
      )
      .run(title, keyword, angle, persona, status) as unknown as { lastInsertRowid?: number };

    const id = result?.lastInsertRowid ?? 0;
    const rawRow = db.prepare("SELECT id, title, keyword, angle, persona, status FROM Topics WHERE id = ?").get(id);
    const row = rawRow as unknown as TopicRow;

    return NextResponse.json({
      id: row.id,
      title: row.title,
      keyword: row.keyword ?? "",
      angle: row.angle ?? "",
      persona: row.persona ?? "",
      status: row.status,
    });
  } catch (e) {
    console.error("POST /api/topics", e);
    return NextResponse.json(
      { error: "Failed to create topic" },
      { status: 500 }
    );
  }
}
