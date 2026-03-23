import { GoogleGenerativeAI } from "@google/generative-ai";
import { getDb, useTurso } from "./db";
import { getMediaList } from "./media-store";
import { readConfig } from "./config-store";
import { getTopicById, updateTopicStatus } from "./topics-store";

const CONFIG_ID = 1;
const GEMINI_BLOG_MODEL = process.env.GEMINI_BLOG_MODEL || "gemini-2.5-flash";
const GEMINI_SOCIAL_MODEL = "gemini-2.5-flash";
const GEMINI_SOCIAL_THINKING_BUDGET = 2048;

export type TopicRecord = {
  id: number;
  title: string;
  keyword: string | null;
  angle: string | null;
  persona: string | null;
  status: string;
  topic_tag?: string | null;
  intent_arc?: string | null;
};

export type ConfigRecord = {
  brand_voice: string | null;
  linkedin_persona: string | null;
  instagram_persona: string | null;
  twitter_persona: string | null;
  value_props: string | null;
  image_style: string | null;
  primary_hex: string | null;
  secondary_hex: string | null;
};

export type GeneratedPayload = {
  blog_html: string;
  meta_description: string | null;
  seo_tags: string[];
  linkedin_post: string;
  instagram_post: string;
  twitter_post: string;
  image_suggestion_prompt: string;
  /** When set, used for DB/UI instead of single linkedin_post (e.g. 3 posts). */
  linkedin_posts?: string[];
  twitter_posts?: string[];
  instagram_posts?: string[];
};

/** When blog is generated with fallback (503/500), UI can show "Generated with Flash due to Pro demand." */
export type BlogModelUsed = "3.1-pro" | "2.5-flash";

/** True if the error indicates 503 Service Unavailable or 500 Internal Error (for model fallback). */
function is503Or500(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const s = msg.toLowerCase();
  return (
    s.includes("503") ||
    s.includes("500") ||
    s.includes("service unavailable") ||
    s.includes("internal server error") ||
    s.includes("internal error")
  );
}

/** Retry on 429 with exponential backoff: 10s then 30s. */
async function withRetryOn429<T>(fn: () => Promise<T>): Promise<T> {
  const delaysMs = [10_000, 30_000];
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const is429 =
        msg.includes("429") || msg.toLowerCase().includes("too many requests");
      if (!is429 || attempt === delaysMs.length) throw e;
      await new Promise((r) => setTimeout(r, delaysMs[attempt]!));
    }
  }

  throw lastErr;
}

/** Recent post summary for Past Context Memory (avoid repeating angles/hooks). */
export type RecentPost = { title: string; keyword: string | null };

/** Fetch last 5 Published or Approved topics (title, keyword) for MEMORY CHECK. */
export async function getRecentPostsFromTopics(): Promise<RecentPost[]> {
  return getRecentPostsForBlogContext(undefined);
}

/** 10 most recent blogs + any blogs with same topic (keyword). For MEMORY CHECK. */
export async function getRecentPostsForBlogContext(topicId?: number): Promise<RecentPost[]> {
  try {
    const db = await getDb();
    const topic = topicId != null ? await getTopic(topicId) : null;
    const sameKeyword = topic?.keyword ? String(topic.keyword).trim() : null;

    const rows = (await db.prepare(
      `SELECT id, title, keyword FROM Topics WHERE status IN ('Published', 'Approved') ORDER BY id DESC LIMIT 20`
    ).all()) as Array<{ id?: number; title?: string; keyword?: string | null }>;

    const recent10 = rows
      .filter((r) => r?.title)
      .slice(0, 10)
      .map((r) => ({ title: String(r.title ?? ""), keyword: r.keyword ?? null }));

    if (!sameKeyword) return recent10;

    const sameTopic = rows
      .filter((r) => r?.title && r.id !== topicId && String(r.keyword ?? "").trim().toLowerCase() === sameKeyword.toLowerCase())
      .map((r) => ({ title: String(r.title ?? ""), keyword: r.keyword ?? null }));

    const seen = new Set(recent10.map((p) => p.title));
    for (const p of sameTopic) {
      if (!seen.has(p.title)) {
        recent10.push(p);
        seen.add(p.title);
      }
    }
    return recent10;
  } catch {
    return [];
  }
}

async function getTopic(topicId: number): Promise<TopicRecord | null> {
  const fileTopic = getTopicById(topicId);
  if (fileTopic) {
    return {
      id: fileTopic.id,
      title: fileTopic.title,
      keyword: fileTopic.keyword ?? null,
      angle: fileTopic.angle ?? null,
      persona: fileTopic.persona ?? null,
      status: fileTopic.status,
      topic_tag: fileTopic.topic_tag ?? null,
      intent_arc: fileTopic.intent_arc ?? null,
    };
  }
  const db = await getDb();
  const raw = await db
    .prepare(
      "SELECT id, title, keyword, angle, persona, status, topic_tag, intent_arc FROM Topics WHERE id = ?"
    )
    .get(topicId);
  const row = raw as unknown as TopicRecord | undefined;
  return row ?? null;
}

async function getConfig(): Promise<ConfigRecord | null> {
  const fileConfig = readConfig();
  if (fileConfig) {
    return {
      brand_voice: fileConfig.brand_voice || null,
      linkedin_persona: fileConfig.linkedin_persona || null,
      instagram_persona: fileConfig.instagram_persona || null,
      twitter_persona: fileConfig.twitter_persona || null,
      value_props: fileConfig.value_props || null,
      image_style: fileConfig.image_style || null,
      primary_hex: fileConfig.primary_hex || null,
      secondary_hex: fileConfig.secondary_hex || null,
    };
  }
  const db = await getDb();
  const raw = await db
    .prepare(
      "SELECT brand_voice, linkedin_persona, instagram_persona, twitter_persona, value_props, image_style, primary_hex, secondary_hex FROM Config WHERE id = ?"
    )
    .get(CONFIG_ID);
  const row = raw as unknown as ConfigRecord | undefined;
  if (!row || typeof (row as Record<string, unknown>).brand_voice === "undefined") return null;
  return row;
}

function buildSharedContext(topic: TopicRecord, valueProps: string[], mediaDescriptions: string[]): string {
  const tagBlock = topic.topic_tag?.trim() ? ` Topic tag: ${topic.topic_tag}.` : "";
  const intentBlock = topic.intent_arc?.trim() ? ` Intent-arc: ${topic.intent_arc}.` : "";
  const originalBrief = [
    `ORIGINAL TOPIC (source of truth for all channels):`,
    `Topic: "${topic.title}".`,
    `Keyword: ${topic.keyword || "none"}. Angle: ${topic.angle || "general"}.`,
    `Audience: ${topic.persona || "general audience"}.`,
    tagBlock,
    intentBlock,
  ].join(" ");

  const valuePropsBlock =
    valueProps.length > 0
      ? `\n\nBlog Value Propositions (weave naturally into content, do not list):\n${valueProps.map((p) => `- ${p}`).join("\n")}`
      : "";

  const mediaBlock =
    mediaDescriptions.length > 0
      ? `\n\nAvailable brand images (consider when relevant): ${mediaDescriptions.join("; ")}`
      : "";

  return `${originalBrief}${valuePropsBlock}${mediaBlock}`;
}

function buildBlogSystemInstruction(): string {
  return `You are a content writer. Generate an SEO-optimized blog post.

BLOG SEO & READABILITY STANDARDS (strict):
- Meta: Include a compelling Meta Description (~150 characters) and 5–8 relevant SEO Tags.
- Hierarchy: Use exactly one keyword-rich H1 as the title, then multiple logical H2 and H3 subheadings.
- Keywords: Naturally integrate the primary topic and related semantic keywords. Prioritize high-value, informative prose over keyword stuffing.
- Format: Output clean Markdown only. Use # for H1, ## for H2, ### for H3. No HTML.

Return ONLY a JSON object. Do not include any markdown formatting like \`\`\`json or introductory text.`;
}

function buildBlogPrompt(topic: TopicRecord, config: ConfigRecord, mediaDescriptions: string[]): string {
  const valueProps = parseValueProps(config.value_props);
  const sharedContext = buildSharedContext(topic, valueProps, mediaDescriptions);
  const blogVoice = config.brand_voice?.trim() || "Professional, clear, and engaging.";

  return `${sharedContext}

BLOG GENERATION:
- Use this persona for tone and voice: ${blogVoice}

Return a single JSON object with exactly these keys:
- "blog_html": string — Full blog in clean Markdown with preserved headings. Exactly ONE # H1, multiple ## H2 and ### H3. ~1,200 words. No HTML.
- "meta_description": string — Compelling ~150 characters.
- "seo_tags": array of 5–8 strings — Relevant SEO tags.

Output only the JSON object.`;
}

/** Build MEMORY CHECK block for Past Context to avoid repeating angles/hooks. */
function buildMemoryCheckBlock(recentPosts: RecentPost[]): string {
  if (!recentPosts.length) return "";
  const list = recentPosts
    .map((p) => `- "${p.title}" (keywords: ${p.keyword || "none"})`)
    .join("\n");
  return `

MEMORY CHECK: Here are the titles and keywords of the last ${recentPosts.length} articles we wrote:
${list}

YOU MUST NOT use the exact same angles, opening hooks, or primary examples as these recent posts. Find a fresh angle or a new RevOps pain point to focus on.

`;
}

/** Prompt for raw Markdown blog (no JSON). Used by two-step flow to avoid token limit. */
function buildBlogMarkdownPrompt(
  topic: TopicRecord,
  config: ConfigRecord,
  mediaDescriptions: string[],
  recentPosts?: RecentPost[]
): string {
  const valueProps = parseValueProps(config.value_props);
  const sharedContext = buildSharedContext(topic, valueProps, mediaDescriptions);
  const blogVoice = config.brand_voice?.trim() || "Professional, clear, and engaging.";
  const topicStr = topic.title;
  const keywords = topic.keyword || topic.title;
  const memoryBlock = buildMemoryCheckBlock(recentPosts ?? []);
  return `${sharedContext}${memoryBlock}
BLOG GENERATION:
- Topic: ${topicStr}
- Target keywords: ${keywords}
- Use this persona for tone and voice: ${blogVoice}
- Output valid HTML (raw tags: <h1>, <h2>, <h3>, <p>, etc.). No markdown code blocks. Target ~1,200 words.

FRONTMATTER (required): Start your response with YAML frontmatter between two "---" lines, then a blank line, then the HTML body. Example:
---
meta_description: "A compelling 150-character description of the post for search results."
seo_tags: ["tag1", "tag2", "tag3", "tag4", "tag5"]
---

<h1>Your Title</h1>
<p>First paragraph...</p>
<h2>First Section</h2>
...

Include 5–8 SEO tags and one meta_description in the frontmatter. Output ONLY raw HTML in the body (no \`\`\`html fences).`;
}

function buildSocialSystemInstruction(): string {
  return `You are a social media copywriter.

Generate LinkedIn, Instagram, and X posts using:
- the provided blog content as context
- the original topic brief
- the Blog Value Propositions
- the platform-specific personas

Return ONLY a JSON object. Do not include any markdown formatting like \`\`\`json or introductory text.`;
}

function buildSocialPromptFromBlog(
  blogHtml: string,
  topic: TopicRecord,
  config: ConfigRecord
): string {
  const valueProps = parseValueProps(config.value_props);
  const sharedContext = buildSharedContext(topic, valueProps, []);

  const blogVoice = config.brand_voice?.trim() || "Professional, clear, and engaging.";
  const linkedinVoice = config.linkedin_persona?.trim() || blogVoice;
  const instagramVoice = config.instagram_persona?.trim() || blogVoice;
  const twitterVoice = config.twitter_persona?.trim() || blogVoice;

  const blogExcerpt = blogHtml.slice(0, 6000);

  return `${sharedContext}

BLOG CONTENT (context — do not copy verbatim):
${blogExcerpt}
${blogHtml.length > 6000 ? "\n[...]" : ""}

PLATFORM PERSONAS:
- LinkedIn persona (linkedin_persona): ${linkedinVoice}
- Instagram persona (instagram_persona): ${instagramVoice}
- X persona (twitter_persona): ${twitterVoice}

Return a single JSON object with exactly these keys:
- "linkedin_post": string — 1 LinkedIn post (plain text; line breaks ok).
- "instagram_post": string — 1 Instagram caption (plain text; emoji ok).
- "twitter_post": string — 1 X post (<= 280 characters).

Output only the JSON object.`;
}

function buildBatchSystemInstruction(): string {
  return `You are an expert SEO strategist and multi-platform copywriter.

You will do THREE steps internally:
1) Plan the SEO strategy (primary keyword, semantic keywords, and H1–H3 outline).
2) Write the full blog in clean Markdown following the plan.
3) Generate LinkedIn, Instagram, and X posts in tandem using the platform personas and the blog you just wrote as context.

Do NOT output the plan.
Return ONLY a JSON object. Do not include any markdown formatting like \`\`\`json or introductory text.`;
}

function buildBatchPrompt(
  topic: TopicRecord,
  config: ConfigRecord,
  mediaDescriptions: string[]
): string {
  const valueProps = parseValueProps(config.value_props);
  const sharedContext = buildSharedContext(topic, valueProps, mediaDescriptions);

  const blogVoice = config.brand_voice?.trim() || "Professional, clear, and engaging.";
  const linkedinVoice = config.linkedin_persona?.trim() || blogVoice;
  const instagramVoice = config.instagram_persona?.trim() || blogVoice;
  const twitterVoice = config.twitter_persona?.trim() || blogVoice;

  return `${sharedContext}

VOICE / PERSONAS:
- Blog persona (brand_voice): ${blogVoice}
- LinkedIn persona (linkedin_persona): ${linkedinVoice}
- Instagram persona (instagram_persona): ${instagramVoice}
- X persona (twitter_persona): ${twitterVoice}

BLOG REQUIREMENTS (strict):
- Output must be clean Markdown only (no HTML).
- Exactly ONE keyword-rich H1 (# ...).
- Multiple H2 (## ...) and H3 (### ...) headings for readability.
- Meta Description: ~150 characters (compelling, not truncated).
- SEO Tags: 5–8 relevant tags (strings).
- Keyword optimization: naturally integrate primary + semantic keywords; provide high value; avoid keyword stuffing.

OUTPUT FORMAT (strict):
Return ONE valid JSON object with exactly these keys:
- "blog_html": string (Markdown blog content with headings preserved)
- "meta_description": string (about 150 chars)
- "seo_tags": array of 5–8 strings
- "linkedin_post": string
- "instagram_post": string
- "twitter_post": string (<= 280 chars)
- "image_suggestion_prompt": string (ONE sentence describing what the Instagram image should look like; no URLs)

Output only the JSON object.`;
}

function parseValueProps(valuePropsJson: string | null): string[] {
  if (!valuePropsJson) return [];
  try {
    const parsed = JSON.parse(valuePropsJson);
    return Array.isArray(parsed) ? parsed.filter((p: unknown) => typeof p === "string") : [];
  } catch {
    return [];
  }
}


function getGeminiProClient(): GoogleGenerativeAI {
  const apiKey =
    process.env.GEMINI_PRO_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_PRO_KEY (or GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY)");
  }
  return new GoogleGenerativeAI(apiKey);
}

function getGeminiFlashClient(): GoogleGenerativeAI {
  const apiKey =
    process.env.GEMINI_FLASH_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_FLASH_KEY (or GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY)");
  }
  return new GoogleGenerativeAI(apiKey);
}

/** Client for blog generation — uses GEMINI_API_KEY (or fallbacks). */
function getGeminiBlogClient(): GoogleGenerativeAI {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_FLASH_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY (or GEMINI_FLASH_KEY / GOOGLE_GENERATIVE_AI_API_KEY)");
  }
  return new GoogleGenerativeAI(apiKey);
}

const BLOG_SYSTEM_INSTRUCTION = `You are an elite B2B SaaS SEO copywriter and RevOps expert. Your task is to write a highly engaging, SEO-optimized blog post based on the user's topic and keywords.

--- SYSTEM CONTEXT: PACEAUDIT BUSINESS OVERVIEW ---

The Pitch: PaceAudit is an automated sales accountability and CRM SLA monitoring platform that integrates with HubSpot to ensure sales reps execute their follow-up cadences, automatically escalating missed tasks via Slack, Teams, SMS, and Email to recover lost pipeline revenue.

What it IS: An internal enforcement and accountability engine. It monitors a company's CRM to see if sales reps are doing their jobs. If a rep forgets to call or email a lead, PaceAudit "nudges" the rep or escalates to management. It IS NOT a customer-facing sales outreach tool.

The Problem: Leads are expensive, but reps let them slip through the cracks. Managers have zero visibility until quotas are missed. "Rotting pipeline" results in massive lost revenue.

Target Audience: VP of Sales, RevOps Managers, Sales Directors, Founders in B2B Sales and mid-market companies relying on SOPs.

Core Features: Bidirectional HubSpot Integration, Cadence Builder, Smart Dispatcher, Multi-Channel Nudges (Slack/Teams/SMS/Email), Automated Escalation Routing (Info/Warning/Critical), Revenue Recovery Tracking.

Target Keywords: Sales Accountability Software, HubSpot SLA Monitoring, RevOps SOP Compliance, Pipeline Revenue Recovery.

Tone: Authoritative but empathetic, direct, ROI-focused. We speak the language of RevOps. We are a safety net for reps and enforcement teeth for managers.

--- WRITING SKILLS & RULES ---

SEO SKILL: Write the post in valid HTML format (no markdown code blocks, just raw HTML tags). Use proper <h2> and <h3> tags naturally. Include the target keywords organically in the first 100 words, one H2, and scattered throughout. Keep paragraphs short (2-3 sentences max).

HUMANIZER SKILL: Sound like a real human expert speaking directly to a RevOps manager. Vary your sentence lengths dramatically (mix short, punchy sentences with longer ones). Use active voice and concrete examples.

ANTI-AI FILTER: You are strictly forbidden from using common AI vocabulary. DO NOT USE the words: delve, crucial, tapestry, paradigm, landscape, overarching, realm, testament, vibrant, bustling, or "in conclusion".

BRAND ALIGNMENT: Seamlessly weave the PaceAudit product into the narrative as the ultimate solution to the problem being discussed in the topic. Do not be overly salesy, but position PaceAudit as the logical RevOps tool.`;

const SOCIAL_SYSTEM_CONTEXT = `You are a B2B RevOps social media copywriter for PaceAudit.

--- SYSTEM CONTEXT: PACEAUDIT ---
PaceAudit: automated sales accountability & CRM SLA monitoring. Integrates with HubSpot. Escalates missed tasks via Slack/Teams/SMS/Email. Target: VP Sales, RevOps, Sales Directors. Tone: authoritative, ROI-focused, RevOps-native.

--- STRICT COPYWRITING & PERSPECTIVE RULES (PLATFORM CADENCE) ---

INSTAGRAM (3 posts, strict cadence):
- Post 1 MUST be post_type "cady"
- Post 2 MUST be post_type "scramble"
- Post 3 MUST be post_type "text"

LINKEDIN (3 posts, pain/value, no characters):
- Post 1 MUST be post_type "value"
- Post 2 MUST be post_type "value"
- Post 3 MUST be post_type "text" (THIS is the template-style hook post)

TWITTER/X (6 posts, pure value snippets):
- Posts 1,2,4,5 MUST be post_type "value"
- Posts 3 and 6 MUST be post_type "text" and MUST include the article link (BLOG_URL).

POST 1: The "Cady" Post (The Protagonist)
- Perspective: Frame the caption around Cady, a successful, highly-efficient RevOps Manager who uses PaceAudit. Pull concrete value points from the article.
- Instagram style: playful, relatable, mass-appealing. Use emojis.

POST 2: The "Scramble" Post (The Antagonist)
- Perspective: Frame the caption around Scramble, a stressed-out RevOps Manager suffering from the problem the article solves (rotting pipeline, missed SLAs, manual tracking). Pull pain points from the article.
- Instagram style: humorous commiseration + pain agitation, with emojis.

POST 3: The Text-Based Hook Post (Cliff Notes)
- Perspective: Direct value delivery to the reader. Use the article's main question/hook and provide the cliff-notes answer.
- Must include a call-to-action link to the full article (use the provided BLOG_URL where applicable).

VALUE SNIPPET POSTS (for LinkedIn + Twitter):
- Do NOT mention Cady or Scramble.
- Just highlight the pain points + lesson + actionable snippet from the blog.
- Twitter: keep them punchy and scannable.
- LinkedIn: simple, illustrative, and grounded in the article (no fluff).

--- IMAGE PROMPT GENERATION (STRICT) ---
For each post object you output, you MUST generate an imagePrompt that matches the post_type.

--- SCENE DIVERSITY RULES (STRICT; DESTROY REPETITION) ---
The character designs are consistent, but scenes MUST NOT become repetitive. Every single post must use a distinct environment + action. You must break out of the office.

BANNED TROPES (STRICTLY FORBIDDEN unless explicitly asked):
- whiteboards
- presentation charts
- bar graphs
- line graphs
- sitting at a desk
- looking at a computer
- messy stacks of paper
- office desks
- computers
- laptops
- presentation screens

Dynamic Environment & Action (MANDATORY):
- You MUST invent a unique, metaphorical 3D claymation environment and a physical action that represents the blog article's topic.
- Do NOT just swap props inside the same scene. Change the environment AND the action.

Prompt Template Structure (MANDATORY):
[Character Description] is [Dynamic Action] in a [Metaphorical Environment] featuring [1-2 Specific Props].

--- SCENE & ACTION IDEA BANK (use these to avoid the rut) ---

For Cady (Success / Pace / Automation) — Scene ideas:
- Running effortlessly on a smooth clay track
- Navigating a clay ship through calm waters
- Building a sturdy clay brick wall
- Conducting a symphony orchestra
- Riding a high-speed clay train
- Planting a flag on a mountain peak
- Assembling a glowing puzzle

For Cady — Actions (do, don’t point):
- running, building, steering, lifting, connecting, guiding, assembling, conducting

For Scramble (Failure / Stress / Lag) — Scene ideas:
- Sinking in a clay quicksand pit
- Stuck in a giant tangled clay spiderweb
- Carrying a massive heavy clay boulder up a hill
- Lost inside a tall clay maze
- Trying to plug multiple holes in a leaking dam
- Running on a giant hamster wheel
- Trapped under a fallen pillar

For Scramble — Actions (struggle physically):
- pushing, sinking, untangling, dropping, scrambling, patching leaks, running in place, looking lost

--- DYNAMIC PROP GENERATION (STILL REQUIRED) ---
When writing the imagePrompt, you MUST avoid the BANNED TROPES above. You must keep the imagery fresh and conceptually interesting.
Deeply analyze the specific topic of the blog article (e.g., SLAs, speed-to-lead, CRM hygiene, automated cadences) and creatively select 1 to 3 minimalist, matte 3D claymation props that act as a visual metaphor for the post's core message.

--- PROP IDEA BANK (use or adapt these; keep Cady/Scramble character descriptions strict) ---

For Cady (Success / Efficiency / Pace / Automation) — examples of dynamic props:
- A perfectly balanced scale (alignment)
- A glowing green traffic light (go/approved)
- A sleek, aerodynamic paper airplane (fast delivery)
- A golden key (unlocking deals)
- A Swiss Army knife (versatility/having the right tools)
- A neatly coiled lasso (capturing leads efficiently)
- A clean, sweeping broom (CRM hygiene)
- A high-speed train engine (momentum)
- A perfectly assembled puzzle piece completing a picture (seamless integration)
- A metronome ticking perfectly (cadence/rhythm)
- A crystal clear magnifying glass (visibility/auditing)
- A sturdy bridge (closing the gap between sales and marketing)
- A set of perfectly meshed gears turning (automation)
- A master control dashboard with a big green button (control)
- A watering can nourishing a blooming plant (nurturing leads)
- A target with a bullseye arrow (accuracy/hitting quotas)
- A shining lighthouse (guidance/clear direction)
- A neatly tied bow on a gift box (delivering value/closed won)
- A pristine, leak-proof hose/pipe (healthy pipeline)
- A baton being passed smoothly (SLA handoffs)

For Scramble (Failure / Stress / Lag / Chaos) — examples of dynamic props:
- A flat tire (loss of momentum)
- A tangled ball of yarn (confusion/messy process)
- A sinking lifeboat (churn)
- A cracked compass (lost direction/bad data)
- A calendar with pages flying off wildly (missed deadlines)
- A leaking pipe with duct tape failing to hold it (rotting pipeline)
- A house of cards collapsing (fragile systems)
- A red stop sign covered in cobwebs (stalled deals)
- A paper shredder jammed with documents (lost info)
- A heavy anchor (slow speed to lead)
- A blindfold (lack of visibility/reporting)
- A baton dropped on the ground (botched handoffs/SLAs)
- A puzzle with missing pieces (incomplete data/CRM gaps)
- A hamster wheel (busy work, no progress)
- A thermometer exploding with heat (burnout)
- A pair of broken binoculars (poor forecasting)
- A maze with dead ends (complex, unbroken sales process)
- A bucket full of holes (leaking revenue)
- An overgrown weed strangling a plant (bad habits taking over)
- A red emergency button covered in caution tape (system failure)

--- EXECUTION RULE ---
Ensure the final imagePrompt seamlessly integrates 1 to 3 of these (or similarly creative) article-relevant clay props into the physical description of the scene. The props MUST be described as "matte 3D claymation" to match the aesthetic. Continue to maintain the strict character descriptions and negative prompts below. Do NOT generate humans or monsters.

post_type = "cady":
"Generate a high-quality 3D claymation scene using the provided reference image of Cady. Use the Prompt Template Structure. Cady must be physically doing something (not pointing) in a unique metaphorical environment that represents the article topic. Include 1–3 matte 3D claymation props from the idea bank (or similar metaphors). Maintain the exact character design, white background, and remove bottom-right watermarks. Do NOT use any BANNED TROPES."

post_type = "scramble":
"Generate a high-quality 3D claymation scene using the provided reference image of Scramble (the purple character). Use the Prompt Template Structure. Scramble must be physically struggling in a unique metaphorical environment that represents the article topic. Include 1–3 matte 3D claymation props from the idea bank (or similar metaphors). Maintain the exact character design, white background, and remove bottom-right watermarks. Do NOT use any BANNED TROPES."

post_type = "text":
"Use the provided reference image template. Replace the center text with this exact phrase: [Insert the article's main question/hook]."

post_type = "value":
"Create a clean, high-quality editorial image that visually illustrates the specific insight in the caption. Use the Prompt Template Structure (no named character required). Use 1–3 matte 3D claymation or minimalist props as visual metaphors where relevant. No text in the image. Do NOT use any BANNED TROPES."

--- UNIVERSAL NEGATIVE PROMPT (APPEND THESE TERMS) ---
Append these terms to the negative prompt you already use:
charts, graphs, whiteboards, office desks, computers, laptops, stacks of paper, presentation screens

--- HUMANIZER FILTER (ALL PLATFORMS) ---
Do NOT use: delve, crucial, tapestry, paradigm, landscape, overarching, realm, testament, vibrant, bustling, or the phrase "in conclusion".
Sound like a real human. Do NOT use generic AI excitement like "Are you ready to transform your sales?!"
`;

/** Strip ```html or ``` markdown fences from Gemini output. Returns raw HTML for Turso. */
function stripHtmlMarkdownFences(text: string): string {
  let out = text.trim();
  out = out.replace(/^```(?:html)?\s*/i, "");
  out = out.replace(/\s*```$/i, "");
  return out.trim();
}

/** Supported Google Imagen 3.0 aspect ratios (for reference). */
export const IMAGEN_ASPECT_RATIOS = {
  LINKEDIN: "16:9" as const,
  INSTAGRAM: "1:1" as const,
  BLOG: "16:9" as const,
};

export type ImagenImageType = keyof typeof IMAGEN_ASPECT_RATIOS;

/**
 * Imagen 3.0 image generation. Raw REST fetch only — no SDK, no generation_config.
 * Returns base64 string. Throws on API error.
 */
export async function generateImage(
  prompt: string,
  type: "LINKEDIN" | "INSTAGRAM" | "BLOG"
): Promise<string> {
  const mappedRatio = type === "INSTAGRAM" ? "1:1" : "16:9";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for image generation");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: mappedRatio,
        },
      }),
    }
  );

  const data = (await response.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    console.error("Raw Image API Error:", JSON.stringify(data, null, 2));
    throw new Error(data.error?.message || "Failed to generate image");
  }

  const base64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (typeof base64 !== "string") throw new Error("No image data in response");
  return base64;
}

/** @deprecated Use generateImage. Kept for backward compatibility. */
export async function generateImageWithImagen(
  prompt: string,
  type: ImagenImageType
): Promise<string | null> {
  try {
    return await generateImage(prompt, type as "LINKEDIN" | "INSTAGRAM" | "BLOG");
  } catch {
    return null;
  }
}

const VISUAL_PROMPT_SYSTEM =
  "You are a professional Creative Director. Read this social media post and write a highly detailed visual prompt for a sophisticated, photorealistic, cinematic image that captures the core concept without using words. Describe the lighting, composition, and style. Return only the prompt text, no preamble.";

/** Library entry for the librarian step: url (identifier we can resolve later) and description. */
export type LibraryImageMeta = { url: string; desc: string };

const LIBRARIAN_SYSTEM = `You are a Creative Director. Your task is to create an image that is relevant and complementary to the post/caption below—the image should illustrate or reinforce the message, not be generic.
Read the post/caption carefully. Look at our image library.
If an image perfectly illustrates or complements this specific post, return its URL and write a prompt to composite it (e.g. "A sleek laptop on a desk displaying the provided image").
If no image fits this post, return URL as null and write a detailed text-to-image prompt that directly reflects the post's topic, tone, and message so the image pairs well with the caption.
Return strict JSON only, no markdown: { "selectedUrl": string | null, "visualPrompt": string }`;

export type LibrarianContext = {
  topicContext?: string;
  brandContext?: string;
  imageStyle?: string;
  negativePrompts?: string;
  /** Visual identity placeholder — cycles through config prompts for variety */
  visualIdentityPrompt?: string;
};

/**
 * Librarian step (Gemini 2.5 Flash): pick a library image or fall back to text-to-image.
 * Optional context (topic + brand) and image style/negative prompts improve relevance and alignment.
 * Returns { selectedUrl: string | null, visualPrompt: string }.
 */
export async function librarianSelectImage(
  postText: string,
  library: LibraryImageMeta[],
  options?: LibrarianContext
): Promise<{ selectedUrl: string | null; visualPrompt: string }> {
  const gen = getGeminiFlashClient();
  const model = gen.getGenerativeModel({
    model: GEMINI_SOCIAL_MODEL,
    generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
  });
  const text = (postText || "").trim().slice(0, 4000);
  const parts: string[] = [`Post/caption:\n${text}`];
  if (options?.topicContext?.trim()) {
    parts.push(`Topic context (use for relevance):\n${options.topicContext.trim().slice(0, 1500)}`);
  }
  if (options?.brandContext?.trim()) {
    parts.push(`Brand context:\n${options.brandContext.trim().slice(0, 1000)}`);
  }
  if (options?.visualIdentityPrompt?.trim()) {
    parts.push(`Use this visual identity for this image: ${options.visualIdentityPrompt.trim().slice(0, 400)}. Apply it while reflecting the post context above.`);
  }
  if (options?.imageStyle?.trim()) {
    parts.push(`Brand image style (follow this): ${options.imageStyle.trim().slice(0, 500)}`);
  }
  if (options?.negativePrompts?.trim()) {
    parts.push(`Avoid in image: ${options.negativePrompts.trim().slice(0, 500)}`);
  }
  const libJson =
    library.length > 0
      ? JSON.stringify(library.map((l) => ({ url: l.url, desc: l.desc })))
      : "[]";
  const prompt = `${LIBRARIAN_SYSTEM}\n\n${parts.join("\n\n")}\n\nImage library:\n${libJson}`;
  const result = await model.generateContent(prompt);
  const raw = result.response.text()?.trim() ?? "";
  const noFences = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const first = noFences.indexOf("{");
  const last = noFences.lastIndexOf("}");
  const jsonStr = first >= 0 && last > first ? noFences.slice(first, last + 1) : noFences;
  try {
    const parsed = JSON.parse(jsonStr) as { selectedUrl?: string | null; visualPrompt?: string };
    const selectedUrl =
      parsed.selectedUrl !== undefined && parsed.selectedUrl !== null
        ? String(parsed.selectedUrl).trim()
        : null;
    const visualPrompt =
      typeof parsed.visualPrompt === "string" && parsed.visualPrompt.trim()
        ? parsed.visualPrompt.trim()
        : "Professional, photorealistic, cinematic scene.";
    return { selectedUrl: selectedUrl || null, visualPrompt };
  } catch {
    return { selectedUrl: null, visualPrompt: "Professional, photorealistic, cinematic scene." };
  }
}

export type NanoBananaAspectRatio = "1:1" | "16:9" | "3:4" | "4:3" | "9:16";

/** Model for image generation (no response_mime_type; image returned in inlineData). */
const IMAGE_GEN_MODEL = "gemini-3.1-flash-image-preview";

/**
 * Gemini Flash Image engine (SDK). Text-to-image or composite with reference image.
 * No response_mime_type / responseModalities — API returns image in candidates[0].content.parts[].inlineData.
 */
export async function generateImageWithNanoBanana(
  prompt: string,
  aspectRatio: NanoBananaAspectRatio = "16:9",
  referenceBase64: string | null = null
): Promise<string | null> {
  console.log("🚀 Calling Gemini Flash Image via generateContent...");

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is not set; cannot call Gemini image API.");
      return null;
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: IMAGE_GEN_MODEL });

    const textContent = referenceBase64
      ? `Use the reference image below as the exact character/template. Then apply these instructions:\n\n${prompt}\n\nAspect ratio: ${aspectRatio}`
      : `${prompt}\n\nAspect ratio: ${aspectRatio}`;

    type Part = { text: string } | { inlineData: { mimeType: string; data: string } };
    const parts: Part[] = [];
    if (referenceBase64) {
      console.log("📸 Reference avatar/template detected; sending as inline_data to Gemini.");
      parts.push({ inlineData: { mimeType: "image/png", data: referenceBase64 } });
    }
    parts.push({ text: textContent });

    const result = await model.generateContent(parts as Parameters<typeof model.generateContent>[0]);
    const candidate = result.response.candidates?.[0];
    const responseParts = candidate?.content?.parts ?? [];
    const imagePart = responseParts.find(
      (p: { inlineData?: { data?: string } }) => p.inlineData && typeof (p.inlineData as { data?: string }).data === "string"
    );
    const base64 = imagePart?.inlineData
      ? (imagePart.inlineData as { data: string }).data
      : null;

    return typeof base64 === "string" && base64.length > 0 ? base64 : null;
  } catch (error) {
    console.error("Image Generation Error:", error);
    return null;
  }
}

/**
 * Use Gemini Flash to turn post/caption text into a detailed visual prompt for Imagen.
 */
export async function generateVisualPromptFromPost(postText: string): Promise<string> {
  const gen = getGeminiFlashClient();
  const model = gen.getGenerativeModel({
    model: GEMINI_SOCIAL_MODEL,
    generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
  });
  const text = (postText || "").trim().slice(0, 4000);
  if (!text) return "Professional, photorealistic, cinematic scene with soft lighting.";
  const result = await model.generateContent(`${VISUAL_PROMPT_SYSTEM}\n\nPost:\n${text}`);
  const response = result.response;
  const prompt = response.text()?.trim();
  return prompt && prompt.length > 0 ? prompt : "Professional, photorealistic, cinematic scene with soft lighting.";
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

/** Reroute all legacy Gemini image calls to Imagen 4.0 (generateFeaturedImage). Stops imageGenerationConfig 400. */
export async function generateImageWithGemini(prompt: string): Promise<string | null> {
  return generateFeaturedImage(prompt);
}

/** Featured image: Imagen 4.0 raw predict, returns data URI. */
export async function generateFeaturedImage(prompt: string): Promise<string | null> {
  const base64 = await generateImageWithNanoBanana(prompt, "16:9");
  if (!base64) return null;
  return `data:image/png;base64,${base64}`;
}

/** Parse YAML frontmatter from blog markdown. Extracts meta_description and seo_tags. */
export function parseBlogFrontmatter(blogHtml: string): {
  meta_description: string | null;
  seo_tags: string[];
} {
  const stripped = parseAndStripBlogFrontmatter(blogHtml);
  return { meta_description: stripped.meta_description, seo_tags: stripped.seo_tags };
}

/**
 * If blogText starts with ---, extract meta_description and seo_tags from the frontmatter block,
 * then strip the entire block so only clean Markdown remains. Return clean markdown as blog_html.
 * If no frontmatter, return blogText as-is with null/empty meta and tags.
 */
export function parseAndStripBlogFrontmatter(blogText: string): {
  meta_description: string | null;
  seo_tags: string[];
  blog_html: string;
} {
  const trimmedStart = blogText.trimStart();
  if (!trimmedStart.startsWith("---")) {
    return { meta_description: null, seo_tags: [], blog_html: blogText };
  }
  const match = blogText.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) {
    return { meta_description: null, seo_tags: [], blog_html: blogText };
  }
  const frontmatter = match[1] ?? "";
  let meta_description: string | null = null;
  let seo_tags: string[] = [];
  const metaMatch = frontmatter.match(/meta_description:\s*["']([^"']*)["']/);
  if (metaMatch?.[1]) meta_description = metaMatch[1].trim();
  const tagsMatch = frontmatter.match(/seo_tags:\s*(\[[\s\S]*?\])/);
  if (tagsMatch?.[1]) {
    try {
      const arr = JSON.parse(tagsMatch[1]) as unknown[];
      seo_tags = arr.filter((t): t is string => typeof t === "string").slice(0, 8);
    } catch {
      /* ignore */
    }
  }
  const body = blogText.slice(match[0].length).trimStart();
  return { meta_description, seo_tags, blog_html: body };
}

function parseBlogResponse(text: string): { blog_html: string; image_prompt?: string } {
  const parsed = parseJsonResponse(text);
  const rec = parsed && typeof (parsed as { error?: string }).error !== "string" ? (parsed as Record<string, unknown>) : {};
  const blog_html = typeof rec.blog_html === "string" ? rec.blog_html : "";
  const image_prompt = typeof rec.image_prompt === "string" ? rec.image_prompt : undefined;
  return { blog_html, image_prompt };
}

/** Parse blog-only JSON (blog_html, meta_description, seo_tags) with frontmatter fallback. */
function parseBlogOnlyResponse(text: string): {
  blog_html: string;
  meta_description: string | null;
  seo_tags: string[];
} {
  const parsed = ensureParsed(parseJsonResponse(text));
  const blog_html = typeof parsed.blog_html === "string" ? parsed.blog_html : "";
  const meta_description =
    typeof parsed.meta_description === "string" ? parsed.meta_description.trim() : null;
  let seo_tags: string[] = [];
  if (Array.isArray(parsed.seo_tags)) {
    seo_tags = parsed.seo_tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
  } else if (typeof parsed.seo_tags === "string") {
    seo_tags = parsed.seo_tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  const fm = parseBlogFrontmatter(blog_html);
  return {
    blog_html,
    meta_description: meta_description ?? fm.meta_description,
    seo_tags: seo_tags.length > 0 ? seo_tags : fm.seo_tags,
  };
}

/** Parse social-only JSON (linkedin_post, instagram_post, twitter_post). */
function parseSocialOnlyResponse(text: string): {
  linkedin_post: string;
  instagram_post: string;
  twitter_post: string;
} {
  const parsed = ensureParsed(parseJsonResponse(text));
  return {
    linkedin_post: typeof parsed.linkedin_post === "string" ? parsed.linkedin_post : "",
    instagram_post: typeof parsed.instagram_post === "string" ? parsed.instagram_post : "",
    twitter_post: typeof parsed.twitter_post === "string" ? parsed.twitter_post : "",
  };
}

function parseBatchResponse(text: string): GeneratedPayload {
  const parsed = ensureParsed(parseJsonResponse(text));

  const blog_html = typeof parsed.blog_html === "string" ? parsed.blog_html : "";
  const meta_description =
    typeof parsed.meta_description === "string" ? parsed.meta_description.trim() : null;

  let seo_tags: string[] = [];
  if (Array.isArray(parsed.seo_tags)) {
    seo_tags = parsed.seo_tags
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
  } else if (typeof parsed.seo_tags === "string") {
    seo_tags = parsed.seo_tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  const linkedin_post = typeof parsed.linkedin_post === "string" ? parsed.linkedin_post : "";
  const instagram_post = typeof parsed.instagram_post === "string" ? parsed.instagram_post : "";
  const twitter_post = typeof parsed.twitter_post === "string" ? parsed.twitter_post : "";
  const image_suggestion_prompt =
    typeof parsed.image_suggestion_prompt === "string"
      ? parsed.image_suggestion_prompt.trim()
      : "";

  // Fallback: if meta/tags missing, attempt extraction from frontmatter in blog_html.
  const fm = parseBlogFrontmatter(blog_html);
  const finalMeta = meta_description ?? fm.meta_description;
  const finalTags = seo_tags.length > 0 ? seo_tags : fm.seo_tags;

  return {
    blog_html,
    meta_description: finalMeta,
    seo_tags: finalTags,
    linkedin_post,
    instagram_post,
    twitter_post,
    image_suggestion_prompt,
  };
}

/**
 * Step 1: Generate blog as raw HTML (with optional frontmatter).
 * Uses Gemini with PaceAudit system context, strict SEO + Humanizer rules.
 * recentPosts: Past context so model avoids repeating angles/hooks from recent articles.
 * Returns HTML string (stripped of markdown fences) for Turso.
 */
export async function generateBlog(
  topicId: number,
  recentPosts?: RecentPost[]
): Promise<string> {
  const topic = await getTopic(topicId);
  if (!topic) throw new Error("Topic not found");
  const config = await getConfig();
  if (!config) throw new Error("Config not found. Save Brand Engineering settings first.");
  const mediaList = getMediaList();
  const mediaDescriptions = mediaList.map((m) => m.description || m.filename).filter(Boolean);
  const userPrompt = buildBlogMarkdownPrompt(topic, config, mediaDescriptions, recentPosts ?? []);

  const gen = getGeminiBlogClient();
  const blogModel = gen.getGenerativeModel({
    model: GEMINI_BLOG_MODEL,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    } as any,
  });
  const fullPrompt = `${BLOG_SYSTEM_INSTRUCTION}\n\n---\n\nUSER REQUEST:\n${userPrompt}`;
  const result = await withRetryOn429(() => blogModel.generateContent(fullPrompt));
  const text = result.response.text();
  if (!text || !text.trim()) throw new Error("No content returned from model");
  return stripHtmlMarkdownFences(text);
}

/** Same as generateBlog but accepts optional user context for regeneration refinement. */
export async function generateBlogWithContext(
  topicId: number,
  userContext?: string,
  recentPosts?: RecentPost[]
): Promise<string> {
  const topic = await getTopic(topicId);
  if (!topic) throw new Error("Topic not found");
  const config = await getConfig();
  if (!config) throw new Error("Config not found. Save Brand Engineering settings first.");
  const mediaList = getMediaList();
  const mediaDescriptions = mediaList.map((m) => m.description || m.filename).filter(Boolean);
  const userPrompt = buildBlogMarkdownPrompt(topic, config, mediaDescriptions, recentPosts ?? []);
  const contextBlock = userContext?.trim()
    ? `\n\nREGENERATION FEEDBACK (incorporate this):\n${userContext}\n`
    : "";
  const systemInstruction = `${BLOG_SYSTEM_INSTRUCTION}${contextBlock}`;

  const gen = getGeminiBlogClient();
  const blogModel = gen.getGenerativeModel({
    model: GEMINI_BLOG_MODEL,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
    } as any,
  });
  const fullPrompt = `${systemInstruction}\n\n---\n\nUSER REQUEST:\n${userPrompt}`;
  const result = await withRetryOn429(() => blogModel.generateContent(fullPrompt));
  const text = result.response.text();
  if (!text || !text.trim()) throw new Error("No content returned from model");
  return stripHtmlMarkdownFences(text);
}

/** Extract text between [TAG]...[/TAG] (case-insensitive). */
function extractTag(text: string, tag: string): string {
  const regex = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, "i");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

const LINKEDIN_COUNT = 3;
const TWITTER_COUNT = 6;
const INSTAGRAM_COUNT = 3;

/** Parse social API response: arrays (linkedin_posts, etc.) or legacy single (linkedin_post, etc.). */
function parseSocialArrays(parsed: Record<string, unknown>): {
  linkedin_posts: string[];
  twitter_posts: string[];
  instagram_posts: string[];
  linkedin_post: string;
  twitter_post: string;
  instagram_post: string;
} {
  const p = parsed as Record<string, unknown>;
  const nested =
    (p.social as Record<string, unknown> | undefined) ??
    (p.posts as Record<string, unknown> | undefined) ??
    (p.output as Record<string, unknown> | undefined) ??
    null;

  const pick = (keys: string[]): unknown => {
    for (const k of keys) {
      if (typeof p[k] !== "undefined") return p[k];
      if (nested && typeof nested[k] !== "undefined") return nested[k];
    }
    return undefined;
  };

  const toStrArr = (v: unknown, max: number): string[] => {
    if (Array.isArray(v)) {
      const captions = v
        .map((item) => {
          if (typeof item === "string") return item.trim();
          if (item && typeof item === "object" && typeof (item as { caption?: unknown }).caption === "string") {
            return String((item as { caption: string }).caption).trim();
          }
          return "";
        })
        .filter((s) => s.length > 0);
      return captions.slice(0, max);
    }
    if (typeof v === "string" && v.trim()) return [v.trim()];
    return [];
  };
  const liArr = toStrArr(
    pick(["linkedin_posts", "linkedinPosts", "linkedin", "linkedIn_posts", "linkedInPosts", "linkedin_post"]),
    LINKEDIN_COUNT
  );
  const twArr = toStrArr(
    pick(["twitter_posts", "twitterPosts", "tweets", "x_posts", "xPosts", "twitter_post"]),
    TWITTER_COUNT
  );
  const igArr = toStrArr(
    pick(["instagram_posts", "instagramPosts", "instagram", "ig_posts", "igPosts", "instagram_post"]),
    INSTAGRAM_COUNT
  );
  return {
    linkedin_posts: liArr,
    twitter_posts: twArr,
    instagram_posts: igArr,
    linkedin_post: liArr[0] ?? "",
    twitter_post: twArr[0] ?? "",
    instagram_post: igArr[0] ?? "",
  };
}

/**
 * Step 2: Generate social posts from blog using PaceAudit context and strict platform rules.
 * Returns 3 LinkedIn, 6 Twitter, 3 Instagram posts.
 */
export async function generateSocialPosts(
  blogTitle: string,
  blogContent: string,
  userContext?: string
): Promise<{
  linkedin_posts: string[];
  twitter_posts: string[];
  instagram_posts: string[];
}> {
  const gen = getGeminiFlashClient();
  const model = gen.getGenerativeModel({
    model: GEMINI_SOCIAL_MODEL,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8192,
      // Force JSON (allowed mimetypes include application/json for text models).
      responseMimeType: "application/json",
    } as any,
  });
  const contextBlock = userContext?.trim()
    ? `\nREGENERATION FEEDBACK (incorporate this): ${userContext}\n\n`
    : "";
  const slug =
    blogTitle
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "post";
  const blogUrl = `https://www.paceaudit.com/articles/${slug}`;
  const instruction = `CRITICAL OUTPUT FORMAT:
- You must return a raw JSON object (not wrapped in markdown backticks).
- Do NOT include any commentary, preamble, or trailing text.
- The object must contain EXACTLY these three keys: linkedin_posts, twitter_posts, instagram_posts.
- Each key MUST be an array.
- Every array item MUST be an object with EXACTLY these keys: post_type, caption, imagePrompt.
- Do NOT include any other keys anywhere.

STRICT ORDERING (MUST MATCH EXACTLY):
- instagram_posts MUST be EXACTLY 3 objects in this exact order:
  1) post_type="cady"
  2) post_type="scramble"
  3) post_type="text"
- linkedin_posts MUST be EXACTLY 3 objects in this exact order:
  1) post_type="value"
  2) post_type="value"
  3) post_type="text"
- twitter_posts MUST be EXACTLY 6 objects in this exact order:
  1) post_type="value"
  2) post_type="value"
  3) post_type="text" (MUST include BLOG_URL)
  4) post_type="value"
  5) post_type="value"
  6) post_type="text" (MUST include BLOG_URL)

You MUST return a raw, valid JSON object with EXACTLY these three keys: linkedin_posts, twitter_posts, instagram_posts.

Schema requirements (STRICT):
- instagram_posts MUST be an array of EXACTLY 3 post objects in this exact order:
  1) post_type = "cady"
  2) post_type = "scramble"
  3) post_type = "text"
- linkedin_posts MUST be an array of EXACTLY 3 post objects in this exact order:
  1) post_type = "value"
  2) post_type = "value"
  3) post_type = "text"
- twitter_posts MUST be an array of EXACTLY 6 post objects in this exact order:
  1) post_type = "value"
  2) post_type = "value"
  3) post_type = "text"  (MUST include BLOG_URL)
  4) post_type = "value"
  5) post_type = "value"
  6) post_type = "text"  (MUST include BLOG_URL)

Each post object MUST have EXACTLY this structure:
{
  "post_type": "cady" | "scramble" | "text" | "value",
  "caption": "The generated caption text here",
  "imagePrompt": "The specific image generation prompt here"
}

Do NOT return markdown. Do NOT wrap in \`\`\`json. Do NOT include any other keys anywhere.

BLOG_URL: ${blogUrl}

${SOCIAL_SYSTEM_CONTEXT}
${contextBlock}Based ONLY on the blog below, generate the JSON object that satisfies the schema above.

Additional constraints:
- Twitter captions MUST be <= 280 characters each. Count characters.
- Twitter posts #3 and #6 MUST include BLOG_URL exactly as provided.
- LinkedIn captions MUST NOT mention Cady or Scramble; they should illustrate pain points + key takeaways from the blog.
- LinkedIn post #3 (post_type="text") MUST be the template-style hook post that tees up the blog's main question/hook and includes a CTA to read the full article.
- Instagram captions follow the Cady/Scramble/Text rules with emojis for IG.
`;
  const content = blogContent.slice(0, 8000);
  const prompt = `${instruction}

BLOG TITLE: ${blogTitle}
BLOG URL (use in at least one Twitter post): ${blogUrl}

BLOG CONTENT:
${content}
${blogContent.length > 8000 ? "\n[... truncated]" : ""}`;

  const validateCadence = (obj: Record<string, unknown>) => {
    const ig = obj.instagram_posts;
    const li = obj.linkedin_posts;
    const tw = obj.twitter_posts;

    const check = (arr: unknown, expected: string[], requireUrlAt?: number[]) => {
      if (!Array.isArray(arr) || arr.length !== expected.length) return false;
      for (let i = 0; i < expected.length; i++) {
        const item = arr[i] as unknown;
        if (!item || typeof item !== "object") return false;
        const p = item as { post_type?: unknown; caption?: unknown; imagePrompt?: unknown };
        if (p.post_type !== expected[i]) return false;
        if (typeof p.caption !== "string" || !p.caption.trim()) return false;
        if (typeof p.imagePrompt !== "string" || !p.imagePrompt.trim()) return false;
        if (requireUrlAt?.includes(i) && !String(p.caption).includes(blogUrl)) return false;
        if (typeof p.caption === "string" && p.caption.length > 280 && expected.length === 6) return false;
      }
      return true;
    };

    return (
      check(ig, ["cady", "scramble", "text"]) &&
      check(li, ["value", "value", "text"]) &&
      check(tw, ["value", "value", "text", "value", "value", "text"], [2, 5])
    );
  };

  const validateCadenceDetailed = (obj: Record<string, unknown>): { ok: boolean; reason?: string } => {
    const checkOne = (label: string, arr: unknown, expected: string[], requireUrlAt?: number[]) => {
      if (!Array.isArray(arr)) return { ok: false, reason: `${label}:not-array` };
      if (arr.length !== expected.length) return { ok: false, reason: `${label}:len-${arr.length}-expected-${expected.length}` };
      for (let i = 0; i < expected.length; i++) {
        const item = arr[i] as unknown;
        if (!item || typeof item !== "object") return { ok: false, reason: `${label}[${i}]:not-object` };
        const p = item as { post_type?: unknown; caption?: unknown; imagePrompt?: unknown };
        if (p.post_type !== expected[i]) return { ok: false, reason: `${label}[${i}]:post_type-${String(p.post_type)}-expected-${expected[i]}` };
        if (typeof p.caption !== "string" || !p.caption.trim()) return { ok: false, reason: `${label}[${i}]:caption-missing` };
        if (typeof p.imagePrompt !== "string" || !p.imagePrompt.trim()) return { ok: false, reason: `${label}[${i}]:imagePrompt-missing` };
        if (requireUrlAt?.includes(i) && !String(p.caption).includes(blogUrl)) return { ok: false, reason: `${label}[${i}]:missing-blog-url` };
        if (typeof p.caption === "string" && p.caption.length > 280 && expected.length === 6) {
          return { ok: false, reason: `${label}[${i}]:caption-too-long-${p.caption.length}` };
        }
      }
      return { ok: true as const };
    };
    const igCheck = checkOne("instagram_posts", obj.instagram_posts, ["cady", "scramble", "text"]);
    if (!igCheck.ok) return igCheck;
    const liCheck = checkOne("linkedin_posts", obj.linkedin_posts, ["value", "value", "text"]);
    if (!liCheck.ok) return liCheck;
    const twCheck = checkOne("twitter_posts", obj.twitter_posts, ["value", "value", "text", "value", "value", "text"], [2, 5]);
    if (!twCheck.ok) return twCheck;
    return { ok: true };
  };

  const reorderByPostType = (
    arr: unknown,
    expected: string[]
  ): Array<{ post_type?: unknown; caption?: unknown; imagePrompt?: unknown }> | null => {
    if (!Array.isArray(arr) || arr.length !== expected.length) return null;
    const items = arr.filter((x): x is { post_type?: unknown; caption?: unknown; imagePrompt?: unknown } => !!x && typeof x === "object");
    if (items.length !== expected.length) return null;
    const map = new Map<string, { post_type?: unknown; caption?: unknown; imagePrompt?: unknown }>();
    for (const it of items) {
      const t = typeof it.post_type === "string" ? it.post_type : "";
      if (t) map.set(t, it);
    }
    const ordered = expected.map((t) => map.get(t)).filter(Boolean) as Array<{ post_type?: unknown; caption?: unknown; imagePrompt?: unknown }>;
    return ordered.length === expected.length ? ordered : null;
  };

  let parsed: unknown = null;
  let lastRaw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra =
      attempt === 0
        ? ""
        : `\n\nIMPORTANT: Your previous output was INVALID. You MUST output the exact JSON object schema and cadence described above. Do not explain. Output JSON only.`;
    const result = await withRetryOn429(() => model.generateContent(prompt + extra));
    const raw = result.response.text();
    lastRaw = raw ?? "";
    // #region agent log
    fetch("http://127.0.0.1:7822/ingest/d299f8e8-acc9-48de-a2c7-afb2bceab8c9", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "584c98" },
      body: JSON.stringify({
        sessionId: "584c98",
        runId: "regen-social-shape",
        hypothesisId: "H1",
        location: "lib/ai-service.ts:generateSocialPosts:attempt",
        message: "Social generation raw response received",
        data: { attempt, rawLength: (raw ?? "").length, startsWithBrace: (raw ?? "").trim().startsWith("{") },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!raw?.trim()) continue;
    parsed = parseJsonResponse(raw);
    if (parsed && typeof (parsed as { error?: string }).error === "string") continue;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // Post-parse fallback: if arrays are the right size but shuffled, reorder by post_type.
      // This protects us from occasional model outputs that contain the correct objects but wrong ordering.
      const obj = parsed as Record<string, unknown>;
      // #region agent log
      fetch("http://127.0.0.1:7822/ingest/d299f8e8-acc9-48de-a2c7-afb2bceab8c9", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "584c98" },
        body: JSON.stringify({
          sessionId: "584c98",
          runId: "regen-social-shape",
          hypothesisId: "H2",
          location: "lib/ai-service.ts:generateSocialPosts:parsed-shape",
          message: "Parsed social JSON shape before cadence validation",
          data: {
            attempt,
            keys: Object.keys(obj).slice(0, 12),
            igLen: Array.isArray(obj.instagram_posts) ? obj.instagram_posts.length : null,
            liLen: Array.isArray(obj.linkedin_posts) ? obj.linkedin_posts.length : null,
            twLen: Array.isArray(obj.twitter_posts) ? obj.twitter_posts.length : null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const igFixed = reorderByPostType(obj.instagram_posts, ["cady", "scramble", "text"]);
      if (igFixed) obj.instagram_posts = igFixed as unknown;
      const liFixed = reorderByPostType(obj.linkedin_posts, ["value", "value", "text"]);
      if (liFixed) obj.linkedin_posts = liFixed as unknown;
      const twFixed = reorderByPostType(obj.twitter_posts, ["value", "value", "text", "value", "value", "text"]);
      if (twFixed) obj.twitter_posts = twFixed as unknown;

      const cadenceDetail = validateCadenceDetailed(parsed as Record<string, unknown>);
      const isValidCadence = cadenceDetail.ok;
      // #region agent log
      fetch("http://127.0.0.1:7822/ingest/d299f8e8-acc9-48de-a2c7-afb2bceab8c9", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "584c98" },
        body: JSON.stringify({
          sessionId: "584c98",
          runId: "regen-social-shape",
          hypothesisId: "H3",
          location: "lib/ai-service.ts:generateSocialPosts:cadence-check",
          message: "Cadence validation result",
          data: { attempt, isValidCadence, reason: cadenceDetail.reason ?? null },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (isValidCadence) break;
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid social JSON: must be an object with linkedin_posts, twitter_posts, instagram_posts arrays");
  }
  if (!validateCadence(parsed as Record<string, unknown>)) {
    const obj = parsed as Record<string, unknown>;
    const detail = validateCadenceDetailed(obj);
    console.error("[generateSocialPosts] Invalid cadence detail:", detail.reason ?? "unknown");
    // #region agent log
    fetch("http://127.0.0.1:7822/ingest/d299f8e8-acc9-48de-a2c7-afb2bceab8c9", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "584c98" },
      body: JSON.stringify({
        sessionId: "584c98",
        runId: "regen-social-shape",
        hypothesisId: "H4",
        location: "lib/ai-service.ts:generateSocialPosts:throw-invalid-cadence",
        message: "Throwing invalid social JSON cadence error",
        data: {
          reason: detail.reason ?? null,
          igLen: Array.isArray(obj.instagram_posts) ? obj.instagram_posts.length : null,
          liLen: Array.isArray(obj.linkedin_posts) ? obj.linkedin_posts.length : null,
          twLen: Array.isArray(obj.twitter_posts) ? obj.twitter_posts.length : null,
          hasIg: Array.isArray(obj.instagram_posts),
          hasLi: Array.isArray(obj.linkedin_posts),
          hasTw: Array.isArray(obj.twitter_posts),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    // Graceful fallback: when structure is mostly valid but strict ordering/type checks fail,
    // continue with parsed caption arrays rather than failing the whole generation.
    const fallback = parseSocialArrays(obj);
    if (
      fallback.linkedin_posts.length >= LINKEDIN_COUNT &&
      fallback.twitter_posts.length >= TWITTER_COUNT &&
      fallback.instagram_posts.length >= INSTAGRAM_COUNT
    ) {
      console.warn("[generateSocialPosts] Falling back to parsed caption arrays despite cadence mismatch");
      return {
        linkedin_posts: fallback.linkedin_posts.slice(0, LINKEDIN_COUNT),
        twitter_posts: fallback.twitter_posts.slice(0, TWITTER_COUNT),
        instagram_posts: fallback.instagram_posts.slice(0, INSTAGRAM_COUNT),
      };
    }

    throw new Error(
      "Invalid social JSON: each of linkedin_posts, twitter_posts, instagram_posts must be an array of exactly 3 post objects in order [cady, scramble, text] with caption and imagePrompt"
    );
  }

  const { linkedin_posts, twitter_posts, instagram_posts } = parseSocialArrays(parsed as Record<string, unknown>);
  if (linkedin_posts.length < 1 || twitter_posts.length < 1 || instagram_posts.length < 1) {
    throw new Error("Invalid social JSON: need linkedin_posts, twitter_posts, instagram_posts arrays");
  }
  // Enforce Twitter 280-char limit
  const enforce280 = (s: string) => (s.length > 280 ? s.slice(0, 277).trim() + "..." : s);
  const trimmed = twitter_posts.slice(0, TWITTER_COUNT).map(enforce280);
  // Ensure at least one post includes the blog URL
  const hasUrl = trimmed.some((p) => p.includes(blogUrl));
  let finalTwitter = trimmed;
  if (!hasUrl && trimmed.length > 0) {
    const spaceNeeded = blogUrl.length + 1;
    const maxContent = 280 - spaceNeeded;
    const first = trimmed[0];
    const shortened =
      first.length > maxContent ? first.slice(0, Math.max(0, maxContent - 3)).trim() + "..." : first;
    finalTwitter = [shortened + " " + blogUrl, ...trimmed.slice(1)].map(enforce280);
  }
  return {
    linkedin_posts: linkedin_posts.slice(0, LINKEDIN_COUNT),
    twitter_posts: finalTwitter,
    instagram_posts: instagram_posts.slice(0, INSTAGRAM_COUNT),
  };
}

type SocialPlatform = "linkedin" | "twitter" | "instagram";
type SocialPostType = "cady" | "scramble" | "text" | "value";

function socialPostTypeFor(platform: SocialPlatform, index: number): SocialPostType {
  if (platform === "instagram") return index === 0 ? "cady" : index === 1 ? "scramble" : "text";
  if (platform === "linkedin") return index === 2 ? "text" : "value";
  // twitter
  return index === 2 || index === 5 ? "text" : "value";
}

function blogUrlFromTitle(blogTitle: string): string {
  const slug =
    blogTitle
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "post";
  return `https://www.paceaudit.com/articles/${slug}`;
}

/** Generate a single social post (caption + imagePrompt) for a specific platform/index. */
export async function generateSingleSocialPost(
  platform: SocialPlatform,
  index: number,
  blogTitle: string,
  blogContent: string,
  userContext?: string
): Promise<{ caption: string; imagePrompt: string; post_type: SocialPostType }> {
  const gen = getGeminiFlashClient();
  const model = gen.getGenerativeModel({
    model: GEMINI_SOCIAL_MODEL,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    } as any,
  });

  const post_type = socialPostTypeFor(platform, index);
  const blogUrl = blogUrlFromTitle(blogTitle);
  const contextBlock = userContext?.trim()
    ? `\nREGENERATION FEEDBACK (incorporate this): ${userContext.trim()}\n\n`
    : "";

  const platformRules =
    platform === "twitter"
      ? `Twitter caption MUST be <= 280 characters. ${index === 2 || index === 5 ? `This post MUST include BLOG_URL exactly as provided.` : ""}`
      : platform === "linkedin"
        ? `LinkedIn captions MUST NOT mention Cady or Scramble. If post_type="text" (index 2), it MUST be the template-style hook post with a CTA to read the full article.`
        : `Instagram captions follow the Cady/Scramble/Text rules with emojis.`;

  const instruction = `Return ONLY a raw JSON object with EXACTLY these keys and nothing else:
{
  "post_type": "${post_type}",
  "caption": "string",
  "imagePrompt": "string"
}

BLOG_URL: ${blogUrl}
PLATFORM: ${platform}
INDEX: ${index}

${SOCIAL_SYSTEM_CONTEXT}
${contextBlock}
Task:
- Generate ONLY the single post object above for PLATFORM/INDEX.
- You MUST set post_type to "${post_type}" exactly.
- ${platformRules}
- imagePrompt MUST follow the IMAGE PROMPT GENERATION rules and DYNAMIC PROP GENERATION.
- Do not output arrays. Do not output any other keys. JSON only.`;

  const content = blogContent.slice(0, 8000);
  const prompt = `${instruction}

BLOG TITLE: ${blogTitle}
BLOG CONTENT:
${content}
${blogContent.length > 8000 ? "\n[... truncated]" : ""}`;

  let parsed: unknown = null;
  let lastRaw = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const extra =
      attempt === 0
        ? ""
        : `\n\nIMPORTANT: Your previous output was INVALID. Output JSON only with keys post_type, caption, imagePrompt.`;
    const result = await withRetryOn429(() => model.generateContent(prompt + extra));
    const raw = result.response.text();
    lastRaw = raw ?? "";
    if (!raw?.trim()) continue;
    parsed = parseJsonResponse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const obj = parsed as Record<string, unknown>;
    if (obj.post_type !== post_type) continue;
    if (typeof obj.caption !== "string" || !obj.caption.trim()) continue;
    if (typeof obj.imagePrompt !== "string" || !obj.imagePrompt.trim()) continue;
    const caption = obj.caption.trim();
    if (platform === "twitter" && caption.length > 280) continue;
    if (platform === "twitter" && (index === 2 || index === 5) && !caption.includes(blogUrl)) continue;
    return { post_type, caption, imagePrompt: (obj.imagePrompt as string).trim() };
  }
  throw new Error(
    `Invalid single social JSON for ${platform}[${index}] (expected post_type=${post_type}). Raw: ${String(lastRaw).slice(0, 400)}`
  );
}

/**
 * Generate social media posts from blog. Uses PaceAudit context + strict rules.
 * Returns 3 LinkedIn, 6 Twitter, 3 Instagram posts.
 */
export async function generateSocialMedia(blogText: string): Promise<{
  linkedin_post: string;
  instagram_post: string;
  twitter_post: string;
  linkedin_posts: string[];
  twitter_posts: string[];
  instagram_posts: string[];
}> {
  const blogExcerpt = blogText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  const title = blogText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, "")
    ?.trim() || blogExcerpt || "Blog Post";
  const result = await generateSocialPosts(title, blogText);
  return {
    linkedin_post: result.linkedin_posts[0] ?? "",
    twitter_post: result.twitter_posts[0] ?? "",
    instagram_post: result.instagram_posts[0] ?? "",
    linkedin_posts: result.linkedin_posts,
    twitter_posts: result.twitter_posts,
    instagram_posts: result.instagram_posts,
  };
}

/** Same as generateSocialMedia but accepts optional user context for regeneration refinement. */
export async function generateSocialMediaWithContext(
  blogText: string,
  userContext?: string
): Promise<{
  linkedin_post: string;
  instagram_post: string;
  twitter_post: string;
  linkedin_posts: string[];
  twitter_posts: string[];
  instagram_posts: string[];
}> {
  const blogExcerpt = blogText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  const title = blogText.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, "")
    ?.trim() || blogExcerpt || "Blog Post";
  const result = await generateSocialPosts(title, blogText, userContext);
  return {
    linkedin_post: result.linkedin_posts[0] ?? "",
    twitter_post: result.twitter_posts[0] ?? "",
    instagram_post: result.instagram_posts[0] ?? "",
    linkedin_posts: result.linkedin_posts,
    twitter_posts: result.twitter_posts,
    instagram_posts: result.instagram_posts,
  };
}

/** Secondary action: Social generation from an existing blog (used by Review page "Generate Social" button). */
export async function generateSocialFromBlog(topicId: number, blogHtml: string): Promise<{ text: string }> {
  const social = await generateSocialMedia(blogHtml);
  return { text: JSON.stringify(social) };
}

/**
 * Two-step orchestration: blog (with Past Context Memory) then social (PaceAudit strict rules).
 * Fetches recent Published/Approved posts for MEMORY CHECK to avoid repeating angles/hooks.
 */
export async function generateBlogAndSocial(
  topicId: number
): Promise<(GeneratedPayload & { modelUsed: BlogModelUsed }) | { error: string }> {
  try {
    const recentPosts = await getRecentPostsForBlogContext(topicId);
    const blogText = await generateBlog(topicId, recentPosts);
    const { blog_html, meta_description, seo_tags } = parseAndStripBlogFrontmatter(blogText);
    const socialResult = await generateSocialMedia(blog_html);
    const linkedinPosts = socialResult.linkedin_posts ?? (socialResult.linkedin_post ? [socialResult.linkedin_post] : []);
    const twitterPosts = socialResult.twitter_posts ?? (socialResult.twitter_post ? [socialResult.twitter_post] : []);
    const instagramPosts = socialResult.instagram_posts ?? (socialResult.instagram_post ? [socialResult.instagram_post] : []);
    const linkedin_post = linkedinPosts[0] ?? "";
    const twitter_post = twitterPosts[0] ?? "";
    const instagram_post = instagramPosts[0] ?? "";
    return {
      blog_html,
      meta_description: meta_description ?? null,
      seo_tags: seo_tags?.length ? seo_tags : [],
      linkedin_post,
      instagram_post,
      twitter_post,
      image_suggestion_prompt: "",
      modelUsed: "3.1-pro",
      linkedin_posts: linkedinPosts,
      twitter_posts: twitterPosts,
      instagram_posts: instagramPosts,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

/**
 * Try to fix unescaped double-quotes inside JSON string values (e.g. "word" inside "... word ...").
 * Walks the string and escapes " that appear inside a value (not structural key/value boundaries).
 */
function repairUnescapedQuotesInJson(s: string): string {
  let out = "";
  let i = 0;
  let inString = false;
  let afterBackslash = false;

  while (i < s.length) {
    const c = s[i];

    if (afterBackslash) {
      out += c;
      afterBackslash = false;
      i++;
      continue;
    }

    if (c === "\\" && inString) {
      out += c;
      afterBackslash = true;
      i++;
      continue;
    }

    // Literal newlines inside a string are invalid JSON; escape them
    if (inString && (c === "\n" || c === "\r")) {
      out += "\\n";
      if (c === "\r" && s[i + 1] === "\n") i++;
      i++;
      continue;
    }

    if (c === '"') {
      if (!inString) {
        inString = true;
        out += c;
        i++;
        continue;
      }
      // We're in a string and hit ". Check if it looks like closing quote (followed by : , } ])
      let j = i + 1;
      while (j < s.length && /[\s\n\r]/.test(s[j])) j++;
      const next = s[j];
      if (next === ":" || next === "," || next === "}" || next === "]") {
        inString = false;
        out += c;
        i++;
        continue;
      }
      // Likely inner quote (e.g. "rotting") — escape it
      out += "\\\"";
      i++;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

function parseJsonResponse(
  text: string
): Record<string, unknown> | { error: string; raw_text: string } {
  const trimmed = text.trim();
  // Clean markdown wrapping/backticks BEFORE attempting JSON.parse.
  // Models sometimes wrap JSON in ```json ... ``` or even single-backtick fences.
  let cleanText = trimmed;
  // Remove leading/trailing fenced code blocks if present.
  cleanText = cleanText.replace(/^\s*```(?:json)?\s*/i, "");
  cleanText = cleanText.replace(/\s*```\s*$/i, "");
  // Remove any remaining fence markers.
  cleanText = cleanText.replace(/```(?:json)?/gi, "").replace(/```/g, "");
  // Remove possible single-backtick wrapping around the whole JSON.
  cleanText = cleanText.replace(/^`+\s*/g, "").replace(/\s*`+$/g, "");
  cleanText = cleanText.trim();

  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  let jsonStr =
    firstBrace >= 0 && lastBrace > firstBrace ? cleanText.slice(firstBrace, lastBrace + 1) : cleanText;

  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    // Repair: trailing commas, then unescaped quotes inside strings
    let repaired = jsonStr
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    repaired = repairUnescapedQuotesInJson(repaired);
    const trimmedEnd = repaired.trimEnd();
    if (trimmedEnd.endsWith('"')) {
      repaired = trimmedEnd + '"}';
    } else if (!trimmedEnd.endsWith("}") && !trimmedEnd.endsWith("]")) {
      repaired = trimmedEnd + "}";
    }
    try {
      return JSON.parse(repaired) as Record<string, unknown>;
    } catch {
      console.error("[ai-service] parseJsonResponse repair failed. Raw text:", jsonStr);
      return { error: "Malformed JSON", raw_text: jsonStr };
    }
  }
}

function ensureParsed(p: Record<string, unknown> | { error: string; raw_text: string }): Record<string, unknown> {
  if (p && typeof (p as Record<string, unknown>).error === "string") {
    throw new Error((p as { error: string }).error);
  }
  return p as Record<string, unknown>;
}

function parseStringArray(val: unknown, max: number): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((p): p is string => typeof p === "string").slice(0, max);
}

export async function saveContentAndSetReview(
  topicId: number,
  payload: GeneratedPayload,
  imageUrl: string | null
): Promise<{ changes: number; id?: number }> {
  const id = Math.floor(Number(topicId));
  if (!Number.isInteger(id) || id < 1) throw new Error("Invalid topicId for database update");
  console.log("[SAVE_SOCIAL] Attempting to save social posts for topicId:", id);
  console.log("[SAVE_SOCIAL] Turso configured:", useTurso());
  console.log("[SAVE_SOCIAL] Payload summary:", {
    hasBlog: !!payload.blog_html?.trim(),
    linkedinCount: payload.linkedin_posts?.length ?? 0,
    twitterCount: payload.twitter_posts?.length ?? 0,
    instagramCount: payload.instagram_posts?.length ?? 0,
  });
  const db = await getDb();
  // Review UI expects arrays (3 LinkedIn, 6 Twitter, 3 Instagram).
  const linkedinCopy = JSON.stringify(
    (payload.linkedin_posts && payload.linkedin_posts.length > 0) ? payload.linkedin_posts : [payload.linkedin_post]
  );
  const twitterCopy = JSON.stringify(
    (payload.twitter_posts && payload.twitter_posts.length > 0) ? payload.twitter_posts : [payload.twitter_post]
  );
  const facebookCopy = JSON.stringify(
    (payload.instagram_posts && payload.instagram_posts.length > 0) ? payload.instagram_posts : [payload.instagram_post]
  );
  const metaDescription = payload.meta_description ?? null;
  const seoTags = JSON.stringify(payload.seo_tags);

  const existingRaw = await db.prepare("SELECT id FROM Content WHERE topic_id = ?").get(id);
  const existing = existingRaw as unknown as { id: number } | undefined;

  try {
    if (existing) {
      console.log("[SAVE_SOCIAL] Updating existing Content row for topicId:", id);
      await db.prepare(
        `UPDATE Content SET blog_html = ?, meta_description = ?, seo_tags = ?, linkedin_copy = ?, twitter_copy = ?, facebook_copy = ?, image_url = ? WHERE topic_id = ?`
      ).run(
        payload.blog_html,
        metaDescription,
        seoTags,
        linkedinCopy,
        twitterCopy,
        facebookCopy,
        imageUrl,
        id
      );
    } else {
      console.log("[SAVE_SOCIAL] Inserting new Content row for topicId:", id);
      await db.prepare(
        `INSERT INTO Content (topic_id, blog_html, meta_description, seo_tags, linkedin_copy, twitter_copy, facebook_copy, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        payload.blog_html,
        metaDescription,
        seoTags,
        linkedinCopy,
        twitterCopy,
        facebookCopy,
        imageUrl
      );
    }
    console.log("[SAVE_SOCIAL] Save successful!");
  } catch (error) {
    console.error("[SAVE_SOCIAL] CRITICAL DB SAVE ERROR:", error);
    throw error;
  }

  // Update file store (if used) and Turso Topics row.
  updateTopicStatus(id, "Review");
  try {
    await db.prepare("UPDATE Topics SET status = ? WHERE id = ?").run("Review", id);
  } catch (e) {
    console.error("[SAVE_SOCIAL] Failed to update Topics status in DB:", e);
  }
  return { changes: 1, id };
}

/**
 * Tandem Generation: Blog (raw Markdown) then social (JSON). Uses two-step flow.
 */
export async function generateContent(topicId: number): Promise<{ ok: true } | { error: string }> {
  const result = await generateBlogAndSocial(topicId);
  if ("error" in result) return { error: result.error };
  await saveContentAndSetReview(topicId, result, null);
  return { ok: true };
}
