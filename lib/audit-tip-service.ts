/**
 * Audit Tip Service
 * Generates a daily Audit Tip using Gemini based on a random topic from Turso.
 */
import { createClient } from "@libsql/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb } from "./db";

const GEMINI_MODEL = "gemini-2.5-pro";

type TopicRow = {
  id: number;
  title: string;
  keyword: string | null;
  angle: string | null;
  persona: string | null;
  status: string;
};

/** Try Turso first, fallback to stub DB. */
async function getRandomTopic(): Promise<TopicRow | null> {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (tursoUrl && tursoToken) {
    try {
      const client = createClient({ url: tursoUrl, authToken: tursoToken });
      const result = await client.execute(
        "SELECT id, title, keyword, angle, persona, status FROM Topics ORDER BY RANDOM() LIMIT 1"
      );
      const row = result.rows[0];
      if (row) {
        return {
          id: Number(row.id),
          title: String(row.title ?? ""),
          keyword: row.keyword != null ? String(row.keyword) : null,
          angle: row.angle != null ? String(row.angle) : null,
          persona: row.persona != null ? String(row.persona) : null,
          status: String(row.status ?? ""),
        };
      }
    } catch {
      // Turso failed, fallback to stub
    }
  }

  try {
    const db = await getDb();
    const rows = (await db.prepare(
      "SELECT id, title, keyword, angle, persona, status FROM Topics ORDER BY RANDOM() LIMIT 1"
    ).all()) as TopicRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Generate a daily Audit Tip using Gemini based on a random topic from the database.
 * Falls back to a generic prompt if no topics exist.
 */
export async function generateDailyAuditTip(): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY required");
  }

  const topic = await getRandomTopic();
  const topicContext = topic
    ? `Topic: "${topic.title}". Keyword: ${topic.keyword || "general"}. Angle: ${topic.angle || "general"}. Persona: ${topic.persona || "auditors and compliance professionals"}.`
    : "General audit, compliance, and risk management.";

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 300,
    },
  });

  const prompt = `You are an expert auditor and compliance advisor. Generate a single, concise "Audit Tip of the Day" that is practical and actionable.

Context: ${topicContext}

Requirements:
- One tip only, 1-3 sentences
- Professional but engaging tone
- Suitable for posting on X (max 280 chars), LinkedIn, Facebook, and Instagram
- No hashtags unless natural (max 2)
- Actionable advice auditors or compliance professionals can use today

Output ONLY the tip text. No quotes, no label, no preamble.`;

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  if (!text || !text.trim()) {
    throw new Error("Gemini returned empty response");
  }
  return text.trim();
}
