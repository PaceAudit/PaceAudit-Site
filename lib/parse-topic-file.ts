/**
 * Parse a TXT or HTML file for topic fields.
 * Expects labeled lines like "Topic title: ...", "Primary Keyword: ...", etc.
 * For HTML, tags are stripped first then the same line-based parsing applies.
 */

export type ParsedTopicFields = {
  title: string;
  keyword: string;
  topic_tag: string;
  persona: string;
  intent_arc: string;
  angle: string;
};

const LABELS: { key: keyof ParsedTopicFields; patterns: string[] }[] = [
  { key: "title", patterns: ["topic title", "topic title:"] },
  { key: "keyword", patterns: ["primary keyword", "primary keyword:"] },
  { key: "topic_tag", patterns: ["topic tag", "topic tag:"] },
  { key: "persona", patterns: ["target persona", "target persona:"] },
  { key: "intent_arc", patterns: ["intent-arc", "intent arc", "intent-arc:", "intent arc:"] },
  { key: "angle", patterns: ["content angle", "content angle:"] },
];

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function getTextFromFile(content: string, filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return stripHtml(content);
  }
  return content;
}

/** Match "Label: value" or "Label : value". Returns the value part (trimmed). */
function parseLine(line: string): { key: keyof ParsedTopicFields; value: string } | null {
  const trimmed = line.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex <= 0) return null;
  const possibleLabel = trimmed.slice(0, colonIndex).trim().toLowerCase();
  const value = trimmed.slice(colonIndex + 1).trim();
  for (const { key, patterns } of LABELS) {
    for (const p of patterns) {
      if (possibleLabel === p || possibleLabel.replace(/\s+/g, " ") === p) {
        return { key, value };
      }
    }
  }
  return null;
}

/** True if the line is the start of a new topic (label is "Topic title" / "Topic Title" etc.). */
function isTopicTitleLine(line: string): boolean {
  const trimmed = line.trim();
  const colonIndex = trimmed.indexOf(":");
  if (colonIndex <= 0) return false;
  const label = trimmed.slice(0, colonIndex).trim().toLowerCase().replace(/\s+/g, " ");
  return label === "topic title";
}

/** Parse a single block of lines into one topic's fields. */
function parseBlock(lines: string[]): ParsedTopicFields {
  const result: ParsedTopicFields = {
    title: "",
    keyword: "",
    topic_tag: "",
    persona: "",
    intent_arc: "",
    angle: "",
  };
  for (const line of lines) {
    const parsed = parseLine(line);
    if (parsed && parsed.value) {
      result[parsed.key] = parsed.value;
    }
  }
  return result;
}

/**
 * Parse file content (TXT or HTML). Each "Topic title: ..." line starts a new topic.
 * Returns an array of topics (one per block). Empty or title-only blocks are skipped.
 */
export function parseTopicFile(content: string, filename: string = ""): ParsedTopicFields[] {
  const text = getTextFromFile(content, filename);
  const lines = text.split(/\r?\n/);
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (isTopicTitleLine(line)) {
      if (current.length > 0) blocks.push(current);
      current = [line];
    } else if (current.length > 0) {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  const topics = blocks.map(parseBlock).filter((t) => t.title.trim().length > 0);
  return topics;
}
