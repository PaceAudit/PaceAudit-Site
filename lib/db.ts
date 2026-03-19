/**
 * Database access: Turso (production) when TURSO_DATABASE_URL + TURSO_AUTH_TOKEN are set,
 * otherwise a stub that returns empty data (file-based stores used).
 */
import {
  getTursoClient,
  isTursoConfigured,
  createTursoAdapter,
  initTursoSchema,
  type DbAdapter,
} from "./turso-db";

const stubAdapter: DbAdapter = {
  prepare(_sql: string) {
    return {
      all: async () => [],
      get: async () => undefined,
      run: async () => {},
    };
  },
};

let initPromise: Promise<void> | null = null;

/** Initialize schema when using Turso. Safe to call multiple times. */
async function ensureInit(): Promise<void> {
  if (!isTursoConfigured()) return;
  if (!initPromise) {
    initPromise = (async () => {
      await initTursoSchema();
      await migrateTursoColumns();
    })();
  }
  await initPromise;
}

/**
 * Get database adapter. When Turso is configured, returns real DB; otherwise stub.
 * All methods (prepare().all, .get, .run) return Promises — use await.
 */
export async function getDb(): Promise<DbAdapter> {
  await ensureInit();
  const client = getTursoClient();
  return client ? createTursoAdapter(client) : stubAdapter;
}

/** Synchronous stub for legacy callers — returns empty data. Prefer async getDb() when Turso is used. */
const syncStub: {
  prepare(_sql: string): {
    all(..._args: unknown[]): unknown[];
    run(..._args: unknown[]): void;
    get(..._args: unknown[]): unknown;
  };
} = {
  prepare(_sql: string) {
    return {
      all: () => [],
      run: () => {},
      get: () => undefined,
    };
  },
};

export const db = syncStub;

export function initDb(): void {
  void ensureInit();
}

export function useTurso(): boolean {
  return isTursoConfigured();
}

// Migrations run when Turso is connected; we apply them in initTursoSchema via ALTER.
export async function migrateTursoColumns(): Promise<void> {
  const client = getTursoClient();
  if (!client) return;
  const adapter = createTursoAdapter(client);
  const alters = [
    "ALTER TABLE Config ADD COLUMN blog_visual_prompts TEXT",
    "ALTER TABLE Config ADD COLUMN linkedin_visual_prompts TEXT",
    "ALTER TABLE Config ADD COLUMN twitter_visual_prompts TEXT",
    "ALTER TABLE Config ADD COLUMN instagram_visual_prompts TEXT",
    "ALTER TABLE Config ADD COLUMN image_negative_prompts TEXT",
    "ALTER TABLE Config ADD COLUMN linkedin_access_token TEXT",
    "ALTER TABLE Config ADD COLUMN linkedin_refresh_token TEXT",
    "ALTER TABLE Config ADD COLUMN linkedin_person_urn TEXT",
    "ALTER TABLE Content ADD COLUMN meta_description TEXT",
    "ALTER TABLE Content ADD COLUMN seo_tags TEXT",
    "ALTER TABLE Content ADD COLUMN linkedin_image_urls TEXT",
    "ALTER TABLE Content ADD COLUMN instagram_image_urls TEXT",
    "ALTER TABLE Content ADD COLUMN linkedin_posted_indices TEXT",
    "ALTER TABLE Content ADD COLUMN twitter_posted_indices TEXT",
    "ALTER TABLE Content ADD COLUMN instagram_posted_indices TEXT",
    "ALTER TABLE Topics ADD COLUMN topic_tag TEXT",
    "ALTER TABLE Topics ADD COLUMN intent_arc TEXT",
  ];
  for (const sql of alters) {
    try {
      await adapter.prepare(sql).run();
    } catch {
      /* column exists */
    }
  }
}

export function migrateConfigVisualPromptsColumns(): void {
  void migrateTursoColumns();
}
export function migrateContentImageUrlsColumns(): void {
  void migrateTursoColumns();
}
export function migrateConfigNegativePrompts(): void {
  void migrateTursoColumns();
}
export function migrateLinkedInTokenColumns(): void {
  void migrateTursoColumns();
}
export function migrateContentSeoColumns(): void {
  void migrateTursoColumns();
}
