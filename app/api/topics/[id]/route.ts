import { NextResponse } from "next/server";
import { getDb, useTurso } from "@/lib/db";
import { updateTopicStatus, removeTopicById } from "@/lib/topics-store";

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
    const valid = ["Pending", "Generating", "Review", "Approved", "Published", "Error"];
    if (typeof status !== "string" || !valid.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (!useTurso()) {
      const updated = updateTopicStatus(topicId, status);
      if (updated) return NextResponse.json({ ok: true });
    }

    const db = await getDb();
    await db.prepare("UPDATE Topics SET status = ? WHERE id = ?").run(status, topicId);
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

    if (!useTurso()) {
      if (removeTopicById(topicId)) return NextResponse.json({ ok: true });
    }

    const db = await getDb();
    await db.prepare("DELETE FROM Content WHERE topic_id = ?").run(topicId);
    await db.prepare("DELETE FROM Topics WHERE id = ?").run(topicId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/topics/[id]", e);
    return NextResponse.json(
      { error: "Failed to delete topic" },
      { status: 500 }
    );
  }
}
