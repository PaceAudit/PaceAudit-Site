import { readFileSync, existsSync, readdirSync } from "fs";
import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "@/lib/db";
import { getMediaList, getUploadPath, getUploadDir } from "@/lib/media-store";
import { readConfig } from "@/lib/config-store";
import { getTopicById } from "@/lib/topics-store";
import {
  librarianSelectImage,
  generateFeaturedImage,
  type NanoBananaAspectRatio,
} from "@/lib/ai-service";

// Give this route more time (Gemini image generation can be slow with large references).
export const maxDuration = 60;

/** Map LINKEDIN/INSTAGRAM to Nano Banana aspect ratios. */
const TYPE_TO_ASPECT: Record<string, NanoBananaAspectRatio> = {
  LINKEDIN: "16:9",
  INSTAGRAM: "1:1",
};

/**
 * POST /api/generate-image
 * Body (topic + type): { topicId: number, type: 'LINKEDIN' | 'INSTAGRAM', index?: number, caption?: string, post_type?: 'cady' | 'scramble' | 'text', imagePrompt?: string, hookText?: string }
 *   → Uses caption when provided (for the specific variation); otherwise fetches post text from DB by index.
 *   → If imagePrompt is provided, uses it directly (skips Librarian) and tries to pick the correct reference image from the media library based on post_type.
 *   → Fetches library metadata, runs Librarian (Gemini 2.5 Flash), then Nano Banana 2 composition; returns { url, base64 }.
 * Body (legacy): { prompt: string } → Uses generateFeaturedImage, returns { url }.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const topicId = typeof body.topicId === "number" ? body.topicId : parseInt(String(body.topicId ?? ""), 10);
    const hasTopicAndType =
      !Number.isNaN(topicId) && topicId >= 1 && (body.type === "LINKEDIN" || body.type === "INSTAGRAM");

    if (!hasTopicAndType) {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (prompt) {
        const url = await generateFeaturedImage(prompt);
        if (!url)
          return NextResponse.json(
            { error: "Image generation not configured or failed" },
            { status: 502 }
          );
        return NextResponse.json({ url });
      }
      return NextResponse.json(
        { error: "Either { topicId, type } or { prompt } is required" },
        { status: 400 }
      );
    }

    const type = body.type === "INSTAGRAM" ? "INSTAGRAM" : "LINKEDIN";
    const index = typeof body.index === "number" ? Math.max(0, Math.floor(body.index)) : 0;
    const cycleIndex = typeof body.cycleIndex === "number" ? Math.max(0, Math.floor(body.cycleIndex)) : 0;
    const aspectRatio = TYPE_TO_ASPECT[type] ?? "1:1";
    const postTypeRaw = typeof body.post_type === "string" ? body.post_type.trim().toLowerCase() : "";
    const post_type = (postTypeRaw === "cady" || postTypeRaw === "scramble" || postTypeRaw === "text") ? postTypeRaw : null;
    const imagePromptRaw = typeof body.imagePrompt === "string" ? body.imagePrompt.trim() : "";
    const hookText = typeof body.hookText === "string" ? body.hookText.trim() : "";

    // Prefer caption from request (the exact variation caption the user sees); fall back to DB
    const captionFromBody =
      typeof body.caption === "string" ? body.caption.trim() : "";

    // 1. Fetch library metadata (real content library from media-store)
    const mediaList = getMediaList();
    const library = mediaList.map((m) => ({
      url: m.url,
      desc: m.description?.trim() || m.filename || "Content image",
    }));

    // 2. Resolve post text: use caption from frontend when provided, else fetch from DB by index
    let postText = captionFromBody;
    if (!postText) {
      const db = await getDb();
      const row = await db
        .prepare(
          "SELECT blog_html, linkedin_copy, twitter_copy, facebook_copy FROM Content WHERE topic_id = ?"
        )
        .get(topicId) as
        | { blog_html?: string; linkedin_copy?: string; twitter_copy?: string; facebook_copy?: string }
        | undefined;

      if (type === "LINKEDIN") {
        const raw = row?.linkedin_copy;
        if (typeof raw === "string" && raw.trim()) {
          try {
            const arr = JSON.parse(raw) as unknown[];
            const val = (Array.isArray(arr) ? arr[index] : arr) ?? "";
            postText = typeof val === "string" ? val : String(val ?? "");
          } catch {
            postText = raw;
          }
        }
      } else {
        const raw = row?.facebook_copy;
        if (typeof raw === "string" && raw.trim()) {
          try {
            const arr = JSON.parse(raw) as unknown[];
            const val = (Array.isArray(arr) ? arr[index] : arr) ?? "";
            postText = typeof val === "string" ? val : String(val ?? "");
          } catch {
            postText = raw;
          }
        }
      }
      if (typeof postText !== "string") postText = "";
      if (!postText.trim()) {
        postText = (row?.blog_html ?? "").toString().replace(/<[^>]+>/g, "").slice(0, 1500) || "Professional content image.";
      }
    }

    // 2b. Fetch topic (file store or DB) and brand config for context
    const topicFromFile = getTopicById(topicId);
    let topicTitle = "";
    let topicKeyword = "";
    let topicAngle = "";
    let topicPersona = "";
    if (topicFromFile) {
      topicTitle = topicFromFile.title ?? "";
      topicKeyword = (topicFromFile as { keyword?: string }).keyword ?? "";
      topicAngle = (topicFromFile as { angle?: string }).angle ?? "";
      topicPersona = (topicFromFile as { persona?: string }).persona ?? "";
    } else {
      try {
        const dbTopic = await getDb();
        const topicRow = (await dbTopic
          .prepare("SELECT id, title, keyword, angle, persona FROM Topics WHERE id = ?")
          .get(topicId)) as { title?: string; keyword?: string; angle?: string; persona?: string } | undefined;
        if (topicRow) {
          topicTitle = topicRow.title ?? "";
          topicKeyword = topicRow.keyword ?? "";
          topicAngle = topicRow.angle ?? "";
          topicPersona = topicRow.persona ?? "";
        }
      } catch {
        /* ignore */
      }
    }
    const topicContext = [topicTitle && `Title: ${topicTitle}`, topicKeyword && `Keyword: ${topicKeyword}`, topicAngle && `Angle: ${topicAngle}`, topicPersona && `Persona: ${topicPersona}`]
      .filter(Boolean)
      .join(". ");

    let imageStyle = "";
    let imageNegativePrompts = "";
    let brandContext = "";
    let socialVisualPrompt = "";
    const fileConfig = readConfig();
    if (fileConfig) {
      imageStyle = fileConfig.image_style?.trim() ?? "";
      imageNegativePrompts = fileConfig.image_negative_prompts?.trim() ?? "";
      try {
        const raw = type === "LINKEDIN" ? fileConfig.linkedin_visual_prompts : fileConfig.instagram_visual_prompts;
        const arr = raw ? JSON.parse(raw) : [];
        const prompts = Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "string") : [];
        socialVisualPrompt = (prompts[cycleIndex % Math.max(1, prompts.length)] ?? prompts[0] ?? "").trim();
      } catch {
        /* use empty */
      }
      const voice = fileConfig.brand_voice?.trim();
      let valueProps: string[] = [];
      try {
        valueProps = fileConfig.value_props ? (JSON.parse(fileConfig.value_props) as string[]) : [];
      } catch {
        /* ignore */
      }
      if (voice || valueProps.length > 0) {
        brandContext = [voice && `Brand voice: ${voice}`, valueProps.length > 0 && `Value props: ${valueProps.join("; ")}`].filter(Boolean).join("\n");
      }
    } else {
      try {
        const dbConfig = await getDb();
        const configRow = (await dbConfig
          .prepare("SELECT brand_voice, value_props, image_style, image_negative_prompts, linkedin_visual_prompts, instagram_visual_prompts FROM Config WHERE id = ?")
          .get(1)) as { brand_voice?: string; value_props?: string; image_style?: string; image_negative_prompts?: string; linkedin_visual_prompts?: string; instagram_visual_prompts?: string } | undefined;
        if (configRow) {
          imageStyle = (configRow.image_style ?? "").trim();
          imageNegativePrompts = (configRow.image_negative_prompts ?? "").trim();
          try {
            const raw = type === "LINKEDIN" ? configRow.linkedin_visual_prompts : configRow.instagram_visual_prompts;
            const arr = raw ? JSON.parse(raw) : [];
            const prompts = Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "string") : [];
            if (!socialVisualPrompt && prompts.length > 0) {
              socialVisualPrompt = (prompts[cycleIndex % Math.max(1, prompts.length)] ?? prompts[0] ?? "").trim();
            }
          } catch {
            /* use empty */
          }
          const voice = (configRow.brand_voice ?? "").trim();
          let valueProps: string[] = [];
          if (configRow.value_props) {
            try {
              valueProps = JSON.parse(configRow.value_props) as string[];
            } catch {
              /* ignore */
            }
          }
          if (voice || valueProps.length > 0) {
            brandContext = [voice && `Brand voice: ${voice}`, valueProps.length > 0 && `Value props: ${valueProps.join("; ")}`].filter(Boolean).join("\n");
          }
        }
      } catch {
        /* columns may not exist yet */
      }
    }

    const pickReference = (kind: "cady" | "scramble" | "text"): string | null => {
      const dir = getUploadDir();
      let files: string[];
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        files = entries.filter((e) => e.isFile()).map((e) => e.name);
      } catch (e) {
        console.warn("[generate-image] Could not read upload directory:", dir, e);
        return null;
      }
      console.log("[generate-image] Files in upload directory:", dir, files);

      const kindLower = kind.toLowerCase();
      const match = files.find((f) => f.toLowerCase().includes(kindLower));
      if (!match) return null;

      const path = getUploadPath(match);
      try {
        return readFileSync(path, { encoding: "base64" });
      } catch (e) {
        console.warn("[generate-image] Could not read reference file:", path, e);
        return null;
      }
    };

    const fillStrictTemplate = (p: string): string => {
      let out = p;
      if (post_type === "cady") {
        out = out.replace(
          /\[insert action related to article[^\]]*\]/gi,
          "confidently pointing to a rising chart while preserving Cady's exact avatar design (same purple shirt, same body shape, same eyes, NO mouth, NO nose). Do not add or change any facial features. Do not add any text in the image. Keep the exact same background, borders, layout, and overall framing as the reference template. Do not move, resize, remove, or restyle any borders or shapes."
        );
      } else if (post_type === "scramble") {
        out = out.replace(
          /\[insert frustrated action[^\]]*\]/gi,
          "pulling his hair out at a desk covered in spreadsheets while preserving Scramble's exact avatar design (same purple body, same shirt, same eyes, NO mouth, NO nose). Do not add or change any facial features. Do not add any text in the image. Keep the exact same background, borders, layout, and overall framing as the reference template. Do not move, resize, remove, or restyle any borders or shapes."
        );
      } else if (post_type === "text") {
        const phrase = hookText || topicContext || "What most RevOps teams miss";
        out = out.replace(
          /\[insert the article's main question\/hook\]/gi,
          phrase
        );
        out +=
          " Keep every element of the template EXACTLY the same (layout, colors, background, shapes, borders, logos, and borders). ONLY replace the center text with the provided phrase. Do not move, recolor, resize, or restyle any other element, including borders and frames.";
      }
      return out;
    };

    let finalVisualPrompt = "";
    let referenceBase64: string | null = null;

    if (imagePromptRaw && post_type) {
      // Strict mode: use the provided prompt (and try to pick the right reference image).
      finalVisualPrompt = fillStrictTemplate(imagePromptRaw);
      referenceBase64 = pickReference(post_type);
      if (!referenceBase64) {
        console.warn("[generate-image] No reference image found for post_type=%s. Media list filenames/descriptions: %s", post_type, mediaList.map((m) => `${m.filename}:${(m.description ?? "").slice(0, 40)}`).join("; "));
      } else {
        console.log("[generate-image] Sending reference image for post_type=%s (base64 length=%d)", post_type, referenceBase64.length);
      }
      // Add minimal context to help the image model choose actions/props correctly.
      finalVisualPrompt = `${finalVisualPrompt}\n\nCaption context: ${postText.slice(0, 500)}`;
      if (imageNegativePrompts) {
        finalVisualPrompt = `${finalVisualPrompt}\n\nAvoid: ${imageNegativePrompts.slice(0, 300)}`;
      }
    } else {
      // Default mode: Librarian selects library image or creates a visual prompt (with brand + topic context).
      const { selectedUrl, visualPrompt } = await librarianSelectImage(postText, library, {
        topicContext: topicContext || undefined,
        brandContext: brandContext || undefined,
        imageStyle: imageStyle || undefined,
        negativePrompts: imageNegativePrompts || undefined,
        visualIdentityPrompt: socialVisualPrompt || undefined,
      });

      finalVisualPrompt = visualPrompt;
      if (imageNegativePrompts) {
        finalVisualPrompt = `${visualPrompt.trim()}. Avoid: ${imageNegativePrompts.slice(0, 300)}`;
      }

      if (selectedUrl) {
        const item = mediaList.find(
          (m) => m.url === selectedUrl || selectedUrl.endsWith(m.filename) || selectedUrl.includes(m.filename)
        );
        if (item) {
          const path = getUploadPath(item.filename);
          if (existsSync(path)) {
            try {
              referenceBase64 = readFileSync(path, { encoding: "base64" });
            } catch (e) {
              console.warn("[generate-image] Could not read library image:", path, e);
            }
          }
        }
      }
    }

    // 5. Image generation via Gemini 3.1 Flash Image (SDK, no response_mime_type)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Image generation not configured (GEMINI_API_KEY missing)" },
        { status: 502 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image-preview" });

    if (referenceBase64 && referenceBase64.length > 2_000_000) {
      console.warn(
        "[generate-image] referenceBase64 is very large (%d chars ~%d MB). This may cause timeouts.",
        referenceBase64.length,
        (referenceBase64.length * 3) / 4 / (1024 * 1024)
      );
    }

    // Gemini expects the image part FIRST, then the text (so the model sees "this image" then "do this").
    const textPart = { text: referenceBase64
      ? `Use the reference image below as the exact character/template. Then apply these instructions:\n\n${finalVisualPrompt}\n\nAspect ratio: ${aspectRatio}`
      : `${finalVisualPrompt}\n\nAspect ratio: ${aspectRatio}`,
    };
    const userPromptParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
    if (referenceBase64) {
      userPromptParts.push({ inlineData: { mimeType: "image/png", data: referenceBase64 } });
    }
    userPromptParts.push(textPart);

    let response: Awaited<ReturnType<typeof model.generateContent>>;
    try {
      response = await model.generateContent(userPromptParts as Parameters<typeof model.generateContent>[0]);
    } catch (e) {
      const errText =
        e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
      console.error("[generate-image] Google image API failed:", errText);
      return NextResponse.json(
        { error: "Image API timed out or rejected the payload" },
        { status: 500 }
      );
    }

    const candidate = response.response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const imagePart = parts.find(
      (p: { inlineData?: { data?: string; mimeType?: string } }) =>
        p.inlineData && typeof (p.inlineData as { data?: string }).data === "string"
    );
    const base64 = imagePart?.inlineData
      ? (imagePart.inlineData as { data: string; mimeType?: string }).data
      : null;

    if (!base64) {
      return NextResponse.json(
        { error: "Image generation failed (no image in response)" },
        { status: 502 }
      );
    }

    const mime = (imagePart?.inlineData as { mimeType?: string } | undefined)?.mimeType ?? "image/jpeg";
    const url = `data:${mime};base64,${base64}`;

    try {
      const db = await getDb();
      await db.prepare("UPDATE Content SET image_url = ? WHERE topic_id = ?").run(url, topicId);
      try {
        const col = type === "LINKEDIN" ? "linkedin_image_urls" : "instagram_image_urls";
        const row = (await db.prepare(`SELECT ${col} FROM Content WHERE topic_id = ?`).get(topicId)) as unknown as { [k: string]: string } | undefined;
        let arr: string[] = [];
        if (row && row[col]) {
          try {
            const parsed = JSON.parse(row[col] as string);
            arr = Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === "string") : [];
          } catch {
            /* use empty */
          }
        }
        while (arr.length <= index) arr.push("");
        arr[index] = url;
        const trimmed = arr.slice(0, 3);
        await db.prepare(`UPDATE Content SET ${col} = ? WHERE topic_id = ?`).run(JSON.stringify(trimmed), topicId);
      } catch (e2) {
        console.warn("[generate-image] Could not save per-variation image URL (columns may need migration):", e2);
      }
    } catch (e) {
      console.warn("[generate-image] Could not save image_url to database:", e);
    }

    return NextResponse.json({ url, base64 });
  } catch (e) {
    console.error("POST /api/generate-image", e);
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: message || "Image generation failed" },
      { status: 500 }
    );
  }
}
