import { NextResponse } from "next/server";
import { generateFeaturedImage } from "@/lib/ai-service";

/** POST { "prompt": string } — generate an image from a prompt. Returns { url } or { error }. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json(
        { error: "prompt is required" },
        { status: 400 }
      );
    }
    const url = await generateFeaturedImage(prompt);
    if (!url) {
      return NextResponse.json(
        { error: "Image generation not configured (IMAGE_GENERATION_URL) or failed" },
        { status: 502 }
      );
    }
    return NextResponse.json({ url });
  } catch (e) {
    console.error("POST /api/generate-image", e);
    return NextResponse.json(
      { error: "Image generation failed" },
      { status: 500 }
    );
  }
}
