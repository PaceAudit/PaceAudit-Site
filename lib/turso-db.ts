/**
 * Turso/LibSQL database client. Used when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set.
 */
import { createClient, type Client } from "@libsql/client";

let tursoClient: Client | null = null;

function isValidTursoUrl(url: string | undefined): boolean {
  const raw = (url ?? "").trim();
  if (!raw) return false;
  return raw.startsWith("libsql://") || raw.startsWith("https://") || raw.startsWith("http://");
}

export function getTursoClient(): Client | null {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const token = process.env.TURSO_AUTH_TOKEN?.trim();
  if (!isValidTursoUrl(url) || !token) return null;
  const validatedUrl = url as string;
  if (!tursoClient) {
    tursoClient = createClient({ url: validatedUrl, authToken: token });
  }
  return tursoClient;
}

export function isTursoConfigured(): boolean {
  return !!(isValidTursoUrl(process.env.TURSO_DATABASE_URL) && process.env.TURSO_AUTH_TOKEN?.trim());
}

/** LibSQL uses ? placeholders; convert to positional args. */
function runParams(sql: string, args: unknown[]): { sql: string; args: unknown[] } {
  return { sql, args };
}

export type DbAdapter = {
  prepare(sql: string): {
    all(...args: unknown[]): Promise<unknown[]>;
    get(...args: unknown[]): Promise<unknown>;
    run(...args: unknown[]): Promise<void>;
  };
};

export function createTursoAdapter(client: Client): DbAdapter {
  return {
    prepare(sql: string) {
      return {
        async all(...args: unknown[]) {
          const { sql: s, args: a } = runParams(sql, args);
          const rs = await client.execute({ sql: s, args: a as any });
          return rs.rows as unknown[];
        },
        async get(...args: unknown[]) {
          const { sql: s, args: a } = runParams(sql, args);
          const rs = await client.execute({ sql: s, args: a as any });
          return rs.rows[0];
        },
        async run(...args: unknown[]) {
          const { sql: s, args: a } = runParams(sql, args);
          await client.execute({ sql: s, args: a as any });
        },
      };
    },
  };
}

const TURSO_SCHEMA = `
CREATE TABLE IF NOT EXISTS Config (
  id INTEGER PRIMARY KEY,
  brand_voice TEXT,
  linkedin_persona TEXT,
  instagram_persona TEXT,
  twitter_persona TEXT,
  value_props TEXT,
  image_style TEXT,
  image_negative_prompts TEXT,
  primary_hex TEXT,
  secondary_hex TEXT,
  blog_visual_prompts TEXT,
  linkedin_visual_prompts TEXT,
  twitter_visual_prompts TEXT,
  instagram_visual_prompts TEXT,
  linkedin_access_token TEXT,
  linkedin_refresh_token TEXT,
  linkedin_person_urn TEXT
);

CREATE TABLE IF NOT EXISTS Topics (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  keyword TEXT,
  angle TEXT,
  persona TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  topic_tag TEXT,
  intent_arc TEXT
);

CREATE TABLE IF NOT EXISTS Content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL UNIQUE,
  blog_html TEXT,
  meta_description TEXT,
  seo_tags TEXT,
  linkedin_copy TEXT,
  twitter_copy TEXT,
  facebook_copy TEXT,
  image_url TEXT,
  linkedin_image_urls TEXT,
  instagram_image_urls TEXT,
  scheduled_date TEXT,
  published_date TEXT,
  status TEXT DEFAULT 'Draft',
  FOREIGN KEY (topic_id) REFERENCES Topics(id)
);

CREATE INDEX IF NOT EXISTS idx_content_topic_id ON Content(topic_id);
CREATE INDEX IF NOT EXISTS idx_content_status ON Content(status);
CREATE INDEX IF NOT EXISTS idx_topics_status ON Topics(status);
`;

export async function initTursoSchema(): Promise<void> {
  const client = getTursoClient();
  if (!client) return;
  const statements = TURSO_SCHEMA.trim()
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    try {
      await client.execute(stmt);
    } catch (e) {
      console.error("[turso] Schema init:", stmt.slice(0, 60), e);
    }
  }
}
