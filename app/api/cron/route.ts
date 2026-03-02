import { NextRequest, NextResponse } from "next/server";
import { generateDailyAuditTip } from "@/lib/audit-tip-service";
import { publishContent } from "@/lib/publish-engine";

/**
 * GET /api/cron
 * Vercel Cron handler: runs daily at 9:00 AM (configured in vercel.json).
 * Generates an Audit Tip via Gemini (from random Turso topic) and publishes to all platforms.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const vercelCron = request.headers.get("x-vercel-cron");

  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  if (cronSecret) {
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (token !== cronSecret && vercelCron !== "1") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (!vercelCron) {
    return NextResponse.json({ error: "CRON_SECRET required or Vercel Cron" }, { status: 401 });
  }

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
      tip: tip.slice(0, 100) + (tip.length > 100 ? "…" : ""),
      results,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron]", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
