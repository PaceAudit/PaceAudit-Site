import { NextRequest, NextResponse } from "next/server";
import { runPublishToGithub } from "@/lib/publish-to-github";

/**
 * GET /api/cron/publish
 * Vercel Cron: runs daily (e.g. 8:00 AM UTC). Finds Approved posts whose scheduled_date is due,
 * builds static HTML, deploys each to Netlify at articles/{slug}.html (buildless), then marks topic and content as Published.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const vercelCron = request.headers.get("x-vercel-cron");

  if (cronSecret) {
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (token !== cronSecret && vercelCron !== "1") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (!vercelCron) {
    return NextResponse.json(
      { error: "CRON_SECRET required or Vercel Cron" },
      { status: 401 }
    );
  }

  try {
    const result = await runPublishToGithub();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[cron/publish]", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
