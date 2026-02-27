import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db";

const CONFIG_ID = 1;
const GEMINI_MODEL = "gemini-2.5-pro";

export type TopicRecord = {
  id: number;
  title: string;
  keyword: string | null;
  angle: string | null;
  persona: string | null;
  status: string;
};

export type ConfigRecord = {
  brand_voice: string | null;
  value_props: string | null;
  image_style: string | null;
  primary_hex: string | null;
  secondary_hex: string | null;
};

export type GeneratedPayload = {
  blog_html: string;
  linkedin_posts: string[];
  twitter_posts: string[];
  image_prompt?: string;
};

function getTopic(topicId: number): TopicRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT id, title, keyword, angle, persona, status FROM Topics WHERE id = ?"
    )
    .get(topicId) as TopicRecord | undefined;
  return row ?? null;
}

function getConfig(): ConfigRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT brand_voice, value_props, image_style, primary_hex, secondary_hex FROM Config WHERE id = ?"
    )
    .get(CONFIG_ID) as ConfigRecord | undefined;
  return row ?? null;
}

function buildSystemInstruction(config: ConfigRecord): string {
  const voice = config.brand_voice?.trim() || "Professional, clear, and engaging.";
  let valueProps: string[] = [];
  if (config.value_props) {
    try {
      const parsed = JSON.parse(config.value_props);
      valueProps = Array.isArray(parsed) ? parsed.filter((p: unknown) => typeof p === "string") : [];
    } catch {
      // ignore
    }
  }
  const valuePropsBlock =
    valueProps.length > 0
      ? `\n\nSeamlessly weave these value propositions into the content where relevant (do not list them; integrate them naturally):\n${valueProps.map((p) => `- ${p}`).join("\n")}`
      : "";

  return `You are a content writer. Strictly follow this brand voice in every piece you write:\n\n${voice}${valuePropsBlock}\n\nOutput only valid JSON. No markdown code fences, no extra text.`;
}

function buildUserPrompt(topic: TopicRecord): string {
  const parts: string[] = [
    `Write content for this topic: "${topic.title}".`,
    `Target keyword: ${topic.keyword || "none"}.`,
    `Content angle: ${topic.angle || "general"}.`,
    `Target persona: ${topic.persona || "general audience"}.`,
  ];
  return `${parts.join(" ")}

Return a single JSON object with exactly these keys:
- "blog_html": string — Full blog post in HTML (use <h1>, <h2>, <p>, <em>, <strong>). Approximately 1,200 words. No <html> or <body>.
- "linkedin_posts": array of exactly 3 strings — Each string is one LinkedIn post (plain text, can include line breaks and emoji).
- "twitter_posts": array of exactly 2 strings — Each string is one X/Twitter post, max 280 characters.
- "image_prompt": string — A detailed prompt for generating a blog cover image (16:9). Describe the visual style, mood, and key elements. No text in the image. Suitable for social sharing.

Output only the JSON object, nothing else.`;
}

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY");
  }
  return new GoogleGenerativeAI(apiKey);
}

/** Generate featured image prompt from config image_style and topic. */
export function generateFeaturedImagePrompt(
  imageStyle: string | null,
  topicTitle: string
): string {
  const style = imageStyle?.trim() || "Professional, clean, editorial.";
  return `Featured image for blog post. Topic: ${topicTitle}. Style: ${style}. High quality, no text in image.`;
}

const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-2.0-flash-exp-image-generation";

/**
 * Generate an image using Gemini image model. Returns a Data URI (data:image/jpeg;base64,...) or null on failure.
 */
export async function generateImageWithGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageGenerationConfig: { aspectRatio: "16:9" as const },
      },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error("[ai-service] Gemini image API error:", res.status, err);
      return null;
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      const inline = part.inlineData;
      if (inline?.data) {
        const mime = inline.mimeType ?? "image/jpeg";
        return `data:${mime};base64,${inline.data}`;
      }
    }
    return null;
  } catch (e) {
    console.error("[ai-service] Gemini image generation failed:", e);
    return null;
  }
}

/** @deprecated Use generateImageWithGemini. Kept for backward compatibility with IMAGE_GENERATION_URL. */
export async function generateFeaturedImage(prompt: string): Promise<string | null> {
  const endpoint = process.env.IMAGE_GENERATION_URL;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.ok) {
        const data = (await res.json()) as { url?: string };
        if (typeof data.url === "string") return data.url;
      }
    } catch {
      /* fall through to Gemini */
    }
  }
  return generateImageWithGemini(prompt);
}

function parseGeneratedText(text: string): GeneratedPayload {
  const trimmed = text.trim();
  const jsonStr = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

  const blog_html = typeof parsed.blog_html === "string" ? parsed.blog_html : "";
  const linkedin_posts = Array.isArray(parsed.linkedin_posts)
    ? parsed.linkedin_posts.filter((p): p is string => typeof p === "string").slice(0, 3)
    : [];
  const twitter_posts = Array.isArray(parsed.twitter_posts)
    ? parsed.twitter_posts.filter((p): p is string => typeof p === "string").slice(0, 2)
    : [];
  const image_prompt =
    typeof parsed.image_prompt === "string" ? parsed.image_prompt : undefined;

  return {
    blog_html,
    linkedin_posts: linkedin_posts.length === 3 ? linkedin_posts : [...linkedin_posts, "", ""].slice(0, 3),
    twitter_posts: twitter_posts.length === 2 ? twitter_posts : [...twitter_posts, ""].slice(0, 2),
    image_prompt,
  };
}

function saveContentAndSetReview(
  topicId: number,
  payload: GeneratedPayload,
  imageUrl: string | null
): void {
  const db = getDb();
  const linkedinCopy = JSON.stringify(payload.linkedin_posts);
  const twitterCopy = JSON.stringify(payload.twitter_posts);

  const existing = db.prepare("SELECT id FROM Content WHERE topic_id = ?").get(topicId) as { id: number } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE Content SET blog_html = ?, linkedin_copy = ?, twitter_copy = ?, image_url = ? WHERE topic_id = ?`
    ).run(payload.blog_html, linkedinCopy, twitterCopy, imageUrl, topicId);
  } else {
    db.prepare(
      `INSERT INTO Content (topic_id, blog_html, linkedin_copy, twitter_copy, image_url) VALUES (?, ?, ?, ?, ?)`
    ).run(topicId, payload.blog_html, linkedinCopy, twitterCopy, imageUrl);
  }

  db.prepare("UPDATE Topics SET status = ? WHERE id = ?").run("Review", topicId);
}

/**
 * Generate content for a topic: fetch topic + config, call Gemini for blog + social,
 * generate image prompt and call image endpoint, save to Content and set topic status to Review.
 */
export async function generateContent(topicId: number): Promise<{ ok: true } | { error: string }> {
  const topic = getTopic(topicId);
  if (!topic) {
    return { error: "Topic not found" };
  }

  const config = getConfig();
  if (!config) {
    return { error: "Config not found. Save Brand Engineering settings first." };
  }

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { error: "Missing GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY" };
  }

  const genAI = getGeminiClient();
  const systemInstruction = buildSystemInstruction(config);
  const userPrompt = buildUserPrompt(topic);
  const fullPrompt = `${systemInstruction}\n\n---\n\n${userPrompt}`;

  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.7,
      maxOutputTokens: 8192,
    },
  });

  const result = await model.generateContent(fullPrompt);
  const response = result.response;
  const text = response.text();
  if (!text) {
    return { error: "No content returned from model" };
  }

  let payload: GeneratedPayload;
  try {
    payload = parseGeneratedText(text);
  } catch (e) {
    console.error("Failed to parse Gemini response as JSON", e);
    return { error: "Invalid JSON in model response" };
  }

  const imagePrompt =
    payload.image_prompt?.trim() ??
    generateFeaturedImagePrompt(config.image_style, topic.title);

  let imageUrl: string | null = null;
  try {
    imageUrl = await generateImageWithGemini(imagePrompt);
  } catch (e) {
    console.error("Image generation failed, saving content without image:", e);
  }

  saveContentAndSetReview(topicId, payload, imageUrl);
  return { ok: true };
}
