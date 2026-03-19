/**
 * File-based topics persistence so Add Topic works without a real DB.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const TOPICS_FILE = ".topics-store.json";

export type StoredTopic = {
  id: number;
  title: string;
  keyword: string;
  angle: string;
  persona: string;
  status: string;
  topic_tag?: string;
  intent_arc?: string;
};

function topicsPath(): string {
  // Vercel serverless filesystem is read-only under /var/task.
  // Use /tmp as writable fallback for file-based mode.
  if (process.env.VERCEL) return join("/tmp", TOPICS_FILE);
  return join(process.cwd(), TOPICS_FILE);
}

export function readTopics(): StoredTopic[] {
  try {
    const path = topicsPath();
    if (!existsSync(path)) return [];
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as { topics?: unknown[] };
    if (!Array.isArray(data.topics)) return [];
    return data.topics.filter(
      (t): t is StoredTopic =>
        t != null &&
        typeof t === "object" &&
        typeof (t as StoredTopic).id === "number" &&
        typeof (t as StoredTopic).title === "string"
    ) as StoredTopic[];
  } catch {
    return [];
  }
}

export function getTopicById(id: number): StoredTopic | null {
  return readTopics().find((t) => t.id === id) ?? null;
}

export function writeTopics(topics: StoredTopic[]): void {
  writeFileSync(topicsPath(), JSON.stringify({ topics }, null, 2), "utf8");
}

export function addTopic(topic: Omit<StoredTopic, "id">): StoredTopic {
  const list = readTopics();
  const nextId = list.length > 0 ? Math.max(...list.map((t) => t.id)) + 1 : 1;
  const newTopic: StoredTopic = { ...topic, id: nextId };
  list.unshift(newTopic);
  writeTopics(list);
  return newTopic;
}

export function updateTopicStatus(id: number, status: string): StoredTopic | null {
  const list = readTopics();
  const idx = list.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], status };
  writeTopics(list);
  return list[idx];
}

export function removeTopicById(id: number): boolean {
  const list = readTopics().filter((t) => t.id !== id);
  if (list.length === readTopics().length) return false;
  writeTopics(list);
  return true;
}
