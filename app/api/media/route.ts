import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "fs";
import {
  getMediaList,
  addMediaItem,
  getUploadPath,
  type MediaItem,
} from "@/lib/media-store";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function safeFilename(original: string): string {
  const ext = original.replace(/^.*\.([^.]+)$/, "$1").toLowerCase() || "jpg";
  const safe = original
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_")
    .slice(0, 80);
  return `${Date.now()}-${safe || "image"}.${ext}`;
}

/** GET /api/media — list all content images */
export async function GET() {
  try {
    const list = getMediaList();
    return NextResponse.json(list);
  } catch (e) {
    console.error("GET /api/media", e);
    return NextResponse.json(
      { error: "Failed to list media" },
      { status: 500 }
    );
  }
}

/** POST /api/media — upload an image (multipart: file, description?) */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const description = (formData.get("description") as string)?.trim() ?? "";

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Use JPEG, PNG, WebP, or GIF." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 10MB)" },
        { status: 400 }
      );
    }

    const filename = safeFilename(file.name);
    const path = getUploadPath(filename);
    const bytes = await file.arrayBuffer();
    writeFileSync(path, Buffer.from(bytes));

    const url = `/uploads/content-images/${filename}`;
    const item = addMediaItem({ filename, description, url });

    return NextResponse.json(item);
  } catch (e) {
    console.error("POST /api/media", e);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
