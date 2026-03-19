/**
 * File-based config persistence so brand config saves without a real DB.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_FILE = ".config-store.json";

export type StoredConfig = {
  brand_voice: string;
  linkedin_persona: string;
  instagram_persona: string;
  twitter_persona: string;
  value_props: string; // JSON array string — Blog only, inherited as context by other channels
  image_style: string;
  image_negative_prompts: string; // Things to avoid in generated images (e.g. no text, no people)
  primary_hex: string;
  secondary_hex: string;
  blog_visual_prompts?: string; // JSON array of 5 — cycles for blog cover images
  linkedin_visual_prompts?: string; // JSON array of 3 — cycles for LinkedIn images
  twitter_visual_prompts?: string; // JSON array of 3 — cycles for X/Twitter images
  instagram_visual_prompts?: string; // JSON array of 3 — cycles for Instagram images
};

function configPath(): string {
  return join(process.cwd(), CONFIG_FILE);
}

export function readConfig(): StoredConfig | null {
  try {
    const path = configPath();
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data.brand_voice !== "string") return null;
    return {
      brand_voice: String(data.brand_voice ?? ""),
      linkedin_persona: String(data.linkedin_persona ?? ""),
      instagram_persona: String(data.instagram_persona ?? ""),
      twitter_persona: String(data.twitter_persona ?? ""),
      value_props: typeof data.value_props === "string" ? data.value_props : "[]",
      image_style: String(data.image_style ?? ""),
      image_negative_prompts: String(data.image_negative_prompts ?? ""),
      primary_hex: String(data.primary_hex ?? "#6ee7b7"),
      secondary_hex: String(data.secondary_hex ?? "#60a5fa"),
      blog_visual_prompts: typeof data.blog_visual_prompts === "string" ? data.blog_visual_prompts : "[]",
      linkedin_visual_prompts: typeof data.linkedin_visual_prompts === "string" ? data.linkedin_visual_prompts : "[]",
      twitter_visual_prompts: typeof data.twitter_visual_prompts === "string" ? data.twitter_visual_prompts : "[]",
      instagram_visual_prompts: typeof data.instagram_visual_prompts === "string" ? data.instagram_visual_prompts : "[]",
    };
  } catch {
    return null;
  }
}

export function writeConfig(config: Partial<StoredConfig> & Pick<StoredConfig, "brand_voice">): void {
  const path = configPath();
  const existing = readConfig();
  const merged: StoredConfig = {
    brand_voice: config.brand_voice,
    linkedin_persona: config.linkedin_persona ?? existing?.linkedin_persona ?? "",
    instagram_persona: config.instagram_persona ?? existing?.instagram_persona ?? "",
    twitter_persona: config.twitter_persona ?? existing?.twitter_persona ?? "",
    value_props: config.value_props ?? existing?.value_props ?? "[]",
    image_style: config.image_style ?? existing?.image_style ?? "",
    image_negative_prompts: config.image_negative_prompts ?? existing?.image_negative_prompts ?? "",
    primary_hex: config.primary_hex ?? existing?.primary_hex ?? "#6ee7b7",
    secondary_hex: config.secondary_hex ?? existing?.secondary_hex ?? "#60a5fa",
    blog_visual_prompts: config.blog_visual_prompts ?? existing?.blog_visual_prompts ?? "[]",
    linkedin_visual_prompts: config.linkedin_visual_prompts ?? existing?.linkedin_visual_prompts ?? "[]",
    twitter_visual_prompts: config.twitter_visual_prompts ?? existing?.twitter_visual_prompts ?? "[]",
    instagram_visual_prompts: config.instagram_visual_prompts ?? existing?.instagram_visual_prompts ?? "[]",
  };
  writeFileSync(path, JSON.stringify(merged, null, 2), "utf8");
}
