import { NextRequest, NextResponse } from "next/server";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { removeMediaItem } from "@/lib/media-store";

/** DELETE /api/media/[id] — remove an image from the library */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const removed = removeMediaItem(id);
    if (!removed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const path = join(process.cwd(), "public", removed.url);
    if (existsSync(path)) {
      unlinkSync(path);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/media/[id]", e);
    return NextResponse.json(
      { error: "Failed to delete" },
      { status: 500 }
    );
  }
}
