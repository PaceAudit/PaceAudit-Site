import { NextResponse } from "next/server";
import { getDb, useTurso } from "@/lib/db";
import { parseTopicFile } from "@/lib/parse-topic-file";

/**
 * POST /api/topics/from-file
 * Body: multipart/form-data with "file" (TXT or HTML).
 * Each "Topic title: ..." line starts a new topic. Creates one topic per block.
 * Returns { topics: [...], count: N }.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing file. Upload a TXT or HTML file." },
        { status: 400 }
      );
    }
    const name = file.name || "";
    const content = await file.text();
    const parsedList = parseTopicFile(content, name);
    if (parsedList.length === 0) {
      return NextResponse.json(
        { error: "File must contain at least one line like 'Topic title: ...' (each starts a new topic)." },
        { status: 400 }
      );
    }

    const status = "Pending";
    const created: Array<{
      id: number;
      title: string;
      keyword: string;
      angle: string;
      persona: string;
      topic_tag: string;
      intent_arc: string;
      status: string;
    }> = [];

    if (useTurso()) {
      const db = await getDb();
      let nextId = ((await db.prepare("SELECT COALESCE(MAX(id), 0) as m FROM Topics").get()) as { m?: number } | undefined)?.m ?? 0;
      for (const parsed of parsedList) {
        nextId += 1;
        const title = parsed.title.trim();
        const keyword = parsed.keyword.trim();
        const angle = parsed.angle.trim();
        const persona = parsed.persona.trim();
        const topic_tag = parsed.topic_tag.trim();
        const intent_arc = parsed.intent_arc.trim();
        await db.prepare(
          "INSERT INTO Topics (id, title, keyword, angle, persona, status, topic_tag, intent_arc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(nextId, title, keyword, angle, persona, status, topic_tag || null, intent_arc || null);
        created.push({
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
      return NextResponse.json({ topics: created, count: created.length });
    }

    const { addTopic } = await import("@/lib/topics-store");
    for (const parsed of parsedList) {
      const title = parsed.title.trim();
      const keyword = parsed.keyword.trim();
      const angle = parsed.angle.trim();
      const persona = parsed.persona.trim();
      const topic_tag = parsed.topic_tag.trim();
      const intent_arc = parsed.intent_arc.trim();
      const newTopic = addTopic({
        title,
        keyword,
        angle,
        persona,
        status,
        topic_tag: topic_tag || undefined,
        intent_arc: intent_arc || undefined,
      });
      created.push({
        id: newTopic.id,
        title: newTopic.title,
        keyword: newTopic.keyword ?? "",
        angle: newTopic.angle ?? "",
        persona: newTopic.persona ?? "",
        topic_tag: newTopic.topic_tag ?? "",
        intent_arc: newTopic.intent_arc ?? "",
        status: newTopic.status,
      });
    }
    return NextResponse.json({ topics: created, count: created.length });
  } catch (e) {
    console.error("POST /api/topics/from-file", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to create topics from file" },
      { status: 500 }
    );
  }
}
