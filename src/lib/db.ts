/**
 * Re-export from root lib/db (Turso + stub). Ensures @/lib/db resolves to the real implementation.
 */
export {
  getDb,
  db,
  initDb,
  useTurso,
  migrateTursoColumns,
  migrateConfigVisualPromptsColumns,
  migrateContentImageUrlsColumns,
  migrateConfigNegativePrompts,
  migrateLinkedInTokenColumns,
  migrateContentSeoColumns,
} from "../../lib/db";
