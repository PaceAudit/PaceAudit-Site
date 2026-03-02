import { NextRequest, NextResponse } from "next/server";
import { publishContent, type PublishContent as PublishContentType } from "@/lib/publish-engine";

export type PublishRequestBody = {
  text: string;
  imageUrl?: string | null;
};

/**
 * POST /api/publish
 * Publishes a content object to X, LinkedIn, Facebook, and Instagram.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PublishRequestBody;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : undefined;

    if (!text) {
      return NextResponse.json(
        { ok: false, error: "text is required" },
        { status: 400 }
      );
    }

    const content: PublishContentType = { text, imageUrl: imageUrl ?? null };
    const results = await publishContent(content);

    const allOk = [results.x, results.linkedin, results.facebook, results.instagram]
      .filter(Boolean)
      .every((r) => r?.ok);
    const atLeastOne = [results.x, results.linkedin, results.facebook, results.instagram]
      .filter(Boolean)
      .some((r) => r?.ok);

    return NextResponse.json({
      ok: atLeastOne,
      results,
      message: allOk
        ? "Published to all platforms"
        : atLeastOne
          ? "Published to some platforms (see results)"
          : "Publish failed on all platforms",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
