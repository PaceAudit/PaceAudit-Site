import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  { params }: Params
) {
  try {
    const { id } = await params;
    const topicId = parseInt(id, 10);
    if (Number.isNaN(topicId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await request.json();
    const status = body.status;
    const valid = ["Pending", "Generating", "Review", "Published"];
    if (typeof status !== "string" || !valid.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const db = getDb();
    const result = db
      .prepare("UPDATE Topics SET status = ? WHERE id = ?")
      .run(status, topicId);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/topics/[id]", e);
    return NextResponse.json(
      { error: "Failed to update topic" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: Params
) {
  try {
    const { id } = await params;
    const topicId = parseInt(id, 10);
    if (Number.isNaN(topicId)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const db = getDb();
    db.prepare("DELETE FROM Content WHERE topic_id = ?").run(topicId);
    const result = db.prepare("DELETE FROM Topics WHERE id = ?").run(topicId);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/topics/[id]", e);
    return NextResponse.json(
      { error: "Failed to delete topic" },
      { status: 500 }
    );
  }
}
