// src/lib/db.ts — minimal stub so app runs without better-sqlite3
const stub = {
  prepare(_sql: string) {
    return {
      all(..._args: unknown[]) {
        return [];
      },
      run(..._args: unknown[]) {},
      get(..._args: unknown[]) {
        return { n: 0 };
      },
    };
  },
};

export const db = stub;
export function getDb() {
  return stub;
}
export function initDb(): void {}

/** Add linkedin_access_token, linkedin_refresh_token, and linkedin_person_urn to Config if missing. Run with real db. */
export function migrateLinkedInTokenColumns(): void {
  try {
    const db = getDb();
    db.prepare("ALTER TABLE Config ADD COLUMN linkedin_access_token TEXT").run();
  } catch {
    /* column exists */
  }
  try {
    const db = getDb();
    db.prepare("ALTER TABLE Config ADD COLUMN linkedin_refresh_token TEXT").run();
  } catch {
    /* column exists */
  }
  try {
    const db = getDb();
    db.prepare("ALTER TABLE Config ADD COLUMN linkedin_person_urn TEXT").run();
  } catch {
    /* column exists */
  }
}

export default getDb;
console.log("Database file loaded successfully (src/lib/db.ts)");
