import { NextResponse } from "next/server";
import { generateContent } from "@/lib/ai-service";

/** POST /api/generate?topicId= — run AI content generation for the topic. */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const topicIdParam = searchParams.get("topicId");
    const topicId = topicIdParam ? parseInt(topicIdParam, 10) : NaN;

    if (Number.isNaN(topicId) || topicId < 1) {
      return NextResponse.json(
        { error: "Valid topicId is required" },
        { status: 400 }
      );
    }

    const result = await generateContent(topicId);

    if ("error" in result) {
      const status =
        result.error === "Topic not found"
          ? 404
          : result.error === "Config not found. Save Brand Engineering settings first." ||
              result.error.startsWith("Missing ")
            ? 400
            : 500;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/generate", e);
    return NextResponse.json(
      { error: "Generation failed" },
      { status: 500 }
    );
  }
}
