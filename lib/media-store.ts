/**
 * Content image library: metadata and file paths for uploaded images
 * used in generated content (e.g. CRM screenshot with text overlay).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const META_FILE = ".content-images-meta.json";
const UPLOAD_DIR = "public/uploads/content-images";

export type MediaItem = {
  id: string;
  filename: string;
  description: string;
  url: string; // e.g. /uploads/content-images/filename
};

function metaPath(): string {
  return join(process.cwd(), META_FILE);
}

function uploadDir(): string {
  return join(process.cwd(), UPLOAD_DIR);
}

export function getMediaList(): MediaItem[] {
  try {
    const path = metaPath();
    if (!existsSync(path)) return [];
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as { images?: MediaItem[] };
    return Array.isArray(data.images) ? data.images : [];
  } catch {
    return [];
  }
}

export function saveMediaList(items: MediaItem[]): void {
  writeFileSync(metaPath(), JSON.stringify({ images: items }, null, 2), "utf8");
}

export function addMediaItem(item: Omit<MediaItem, "id">): MediaItem {
  const list = getMediaList();
  const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const newItem: MediaItem = { ...item, id };
  list.push(newItem);
  saveMediaList(list);
  return newItem;
}

export function removeMediaItem(id: string): MediaItem | null {
  const list = getMediaList();
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const removed = list.splice(idx, 1)[0];
  saveMediaList(list);
  return removed;
}

export function ensureUploadDir(): string {
  const dir = uploadDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getUploadPath(filename: string): string {
  return join(ensureUploadDir(), filename);
}

/** Returns the upload directory path (ensures it exists). Use for readdirSync etc. */
export function getUploadDir(): string {
  return ensureUploadDir();
}
