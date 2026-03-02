import { NextResponse } from "next/server";
import { generateDailyAuditTip } from "@/lib/audit-tip-service";
import { publishContent } from "@/lib/publish-engine";

/**
 * POST /api/publish/daily
 * Generates a daily Audit Tip (Gemini + random Turso topic) and publishes to all platforms.
 * Used by Admin "Post Now" and mirrors the cron flow.
 */
export async function POST() {
  try {
    const tip = await generateDailyAuditTip();
    if (!tip || !tip.trim()) {
      return NextResponse.json(
        { ok: false, error: "Failed to generate Audit Tip" },
        { status: 500 }
      );
    }

    const results = await publishContent({ text: tip, imageUrl: null });

    const atLeastOne = [results.x, results.linkedin, results.facebook, results.instagram]
      .filter(Boolean)
      .some((r) => r?.ok);

    return NextResponse.json({
      ok: atLeastOne,
      tip,
      results,
      message: atLeastOne ? "Published" : "Publish failed on all platforms",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[publish/daily]", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
