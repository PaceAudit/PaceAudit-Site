/**
 * Scheduler: sends approved content to LinkedIn, Facebook, Meta (Instagram), X (Twitter), and Netlify.
 * Netlify = GitHub repo (blog HTML) + optional deploy hook. Social = first post per channel from Content row.
 */
import cron from "node-cron";
import { Octokit } from "octokit";
import { TwitterApi } from "twitter-api-v2";
import { getDb } from "./db";
import { publishLinkedInPost } from "./linkedin-auth";
import { publishToFacebook, publishToInstagram } from "./publish-service";

export { publishLinkedInPost as publishToLinkedIn };

type ContentRow = {
  id: number;
  topic_id: number;
  blog_html: string | null;
  linkedin_copy: string | null;
  twitter_copy: string | null;
  facebook_copy: string | null;
  image_url: string | null;
  scheduled_date: string | null;
  linkedin_posted_indices: string | null;
  twitter_posted_indices: string | null;
  instagram_posted_indices: string | null;
};

function parsePostedIndices(raw: string | null | undefined): number[] {
  if (raw == null || !String(raw).trim()) return [];
  try {
    const arr = JSON.parse(String(raw));
    return Array.isArray(arr) ? arr.filter((x: unknown) => typeof x === "number" && Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

/**
 * Trigger a Netlify build so the site reflects the latest GitHub content.
 * Call after publishToGitHub when NETLIFY_DEPLOY_HOOK is set.
 */
export async function triggerNetlifyDeploy(): Promise<{ ok: boolean; error?: string }> {
  const hook = process.env.NETLIFY_DEPLOY_HOOK;
  if (!hook || !hook.startsWith("https://")) {
    return { ok: false, error: "NETLIFY_DEPLOY_HOOK not set or invalid" };
  }
  try {
    const res = await fetch(hook, { method: "POST" });
    if (!res.ok) {
      return { ok: false, error: `Netlify deploy hook: HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/** Publish blog_html to the GitHub repo used by Netlify (create or update file at path). */
export async function publishToGitHub(blogHtml: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const path = process.env.GITHUB_CONTENT_PATH || "content/post.html";
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!token || !owner || !repo) {
    return { ok: false, error: "GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME required" };
  }

  try {
    const octokit = new Octokit({ auth: token });
    const content = Buffer.from(blogHtml, "utf8").toString("base64");

    let sha: string | undefined;
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref: branch,
      });
      if (!("sha" in data) || !data.sha) throw new Error("No sha");
      sha = data.sha;
    } catch {
      // File does not exist, create new
    }

    if (sha) {
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: "Publish post via Content Engine",
        content,
        sha,
        branch,
      });
    } else {
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: "Publish post via Content Engine",
        content,
        branch,
      });
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/** Post the first Twitter post via Twitter API v2. */
export async function publishToX(text: string): Promise<{ ok: boolean; error?: string }> {
  const appKey = process.env.TWITTER_APP_KEY;
  const appSecret = process.env.TWITTER_APP_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    return { ok: false, error: "Twitter API credentials not configured" };
  }

  try {
    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });
    const rw = client.readWrite;
    await rw.v2.tweet(text.slice(0, 280));
    return { ok: true };
  } catch (e) {
    const anyErr = e as unknown as Record<string, unknown>;
    const message = e instanceof Error ? e.message : String(e);
    const code =
      typeof anyErr.code === "number"
        ? anyErr.code
        : typeof anyErr.statusCode === "number"
          ? anyErr.statusCode
          : typeof anyErr.status === "number"
            ? anyErr.status
            : null;
    const title = typeof anyErr.title === "string" ? anyErr.title : null;
    const detail = typeof anyErr.detail === "string" ? anyErr.detail : null;
    const data = anyErr.data;
    const dataSummary =
      data && typeof data === "object"
        ? (() => {
            try {
              // twitter-api-v2 often includes structured API errors under `data`.
              return JSON.stringify(data).slice(0, 600);
            } catch {
              return null;
            }
          })()
        : null;

    const parts = [
      code ? `HTTP ${code}` : null,
      title,
      detail,
      dataSummary ? `data=${dataSummary}` : null,
      !code && !title && !detail && !dataSummary ? message : null,
    ].filter(Boolean);

    return { ok: false, error: parts.join(" | ") };
  }
}

async function getScheduledContent(): Promise<ContentRow[]> {
  const db = await getDb();
  const now = new Date().toISOString();
  const rows = (await db
    .prepare(
      `SELECT id, topic_id, blog_html, linkedin_copy, twitter_copy, facebook_copy, image_url, scheduled_date,
              linkedin_posted_indices, twitter_posted_indices, instagram_posted_indices
       FROM Content
       WHERE status = 'Scheduled' AND scheduled_date IS NOT NULL AND scheduled_date <= ?`
    )
    .all(now)) as ContentRow[];
  return rows;
}

async function markPublished(contentId: number, topicId: number): Promise<void> {
  const db = await getDb();
  await db.prepare(
    "UPDATE Content SET status = 'Published', published_date = ? WHERE id = ?"
  ).run(new Date().toISOString(), contentId);
  await db.prepare("UPDATE Topics SET status = 'Published' WHERE id = ?").run(topicId);
}

async function runPublishCycle(): Promise<void> {
  const db = await getDb();
  const rows = await getScheduledContent();
  for (const row of rows) {
    const blogHtml = row.blog_html ?? "";
    let linkedinCopy: string[] = [];
    let twitterCopy: string[] = [];
    let facebookCopy: string[] = [];
    try {
      if (row.linkedin_copy) linkedinCopy = JSON.parse(row.linkedin_copy);
      if (row.twitter_copy) twitterCopy = JSON.parse(row.twitter_copy);
      if (row.facebook_copy) facebookCopy = JSON.parse(row.facebook_copy);
    } catch {
      /* ignore */
    }
    const linkedinPosted = parsePostedIndices(row.linkedin_posted_indices);
    const twitterPosted = parsePostedIndices(row.twitter_posted_indices);
    const instagramPosted = parsePostedIndices(row.instagram_posted_indices);

    // First unposted index per platform (scheduler posts one segment per platform per run)
    const liIdx = [0, 1, 2].find((i) => !linkedinPosted.includes(i));
    const twIdx = [0, 1, 2, 3, 4, 5].find((i) => !twitterPosted.includes(i));
    const igIdx = [0, 1, 2].find((i) => !instagramPosted.includes(i));

    const firstLinkedIn = liIdx != null ? linkedinCopy[liIdx]?.trim() : "";
    const firstTwitter = twIdx != null ? (twitterCopy[twIdx] ?? "").trim().slice(0, 280) : "";
    const facebookMessage = (igIdx != null ? facebookCopy[igIdx] : facebookCopy[0])?.trim()?.slice(0, 5000) || firstLinkedIn.slice(0, 5000);

    // 1) Netlify website: push to GitHub (unchanged — blog is published separately via cron/publish-now)
    let ghOk = false;
    if (blogHtml) {
      const gh = await publishToGitHub(blogHtml);
      ghOk = gh.ok;
      if (!gh.ok) console.error("[scheduler] GitHub (Netlify):", gh.error);
      if (ghOk) {
        const netlify = await triggerNetlifyDeploy();
        if (!netlify.ok) console.error("[scheduler] Netlify deploy hook:", netlify.error);
      }
    }

    let publicImageUrl: string | null =
      row.image_url && row.image_url.startsWith("http") ? row.image_url : null;
    if (!publicImageUrl && ghOk && process.env.SITE_URL) {
      publicImageUrl = `${process.env.SITE_URL.replace(/\/$/, "")}/images/content-${row.id}.jpg`;
    }
    let igImageUrl = publicImageUrl;
    if (!igImageUrl && row.image_url && String(row.image_url).startsWith("http")) {
      igImageUrl = row.image_url;
    }

    // 2) Meta (Facebook & Instagram) — only post next unposted index
    if (igImageUrl && facebookMessage && igIdx != null) {
      const fb = await publishToFacebook(row.id, facebookMessage, igImageUrl);
      if (!fb.ok) console.error("[scheduler] Facebook:", fb.error);
      const ig = await publishToInstagram(row.id, facebookMessage, igImageUrl);
      if (!ig.ok) console.error("[scheduler] Instagram:", ig.error);
      if (ig.ok) {
        const next = [...instagramPosted, igIdx].sort((a, b) => a - b);
        await db.prepare("UPDATE Content SET instagram_posted_indices = ? WHERE id = ?").run(JSON.stringify(next), row.id);
      }
    }

    // 3) X and LinkedIn — only post next unposted index
    if (firstTwitter && twIdx != null) {
      const x = await publishToX(firstTwitter);
      if (!x.ok) console.error("[scheduler] X:", x.error);
      if (x.ok) {
        const next = [...twitterPosted, twIdx].sort((a, b) => a - b);
        await db.prepare("UPDATE Content SET twitter_posted_indices = ? WHERE id = ?").run(JSON.stringify(next), row.id);
      }
    }
    if (firstLinkedIn && liIdx != null) {
      const li = await publishLinkedInPost(firstLinkedIn);
      if (!li.ok) console.error("[scheduler] LinkedIn:", li.error);
      if (li.ok) {
        const next = [...linkedinPosted, liIdx].sort((a, b) => a - b);
        await db.prepare("UPDATE Content SET linkedin_posted_indices = ? WHERE id = ?").run(JSON.stringify(next), row.id);
      }
    }

    const nextLi = linkedinPosted.length + (firstLinkedIn && liIdx != null ? 1 : 0);
    const nextTw = twitterPosted.length + (firstTwitter && twIdx != null ? 1 : 0);
    const nextIg = instagramPosted.length + (igIdx != null && facebookMessage ? 1 : 0);
    if (nextLi >= 1 && nextTw >= 1 && nextIg >= 1) {
      await markPublished(row.id, row.topic_id);
    }
  }
}

/** Start the hourly cron job. Call from instrumentation (Node only). */
export function startScheduler(): void {
  cron.schedule("0 * * * *", () => {
    runPublishCycle().catch((e) => console.error("[scheduler]", e));
  });
}
