/**
 * Scheduler: sends approved content to LinkedIn, Facebook, Meta (Instagram), X (Twitter), and Netlify.
 * Netlify = GitHub repo (blog HTML) + optional deploy hook. Social = first post per channel from Content row.
 */
import cron from "node-cron";
import { Octokit } from "octokit";
import { TwitterApi } from "twitter-api-v2";
import { getDb } from "./db";
import { getLinkedInAccessToken, getLinkedInPersonUrn } from "./linkedin-auth";
import { publishToFacebook, publishToInstagram } from "./publish-service";

type ContentRow = {
  id: number;
  topic_id: number;
  blog_html: string | null;
  linkedin_copy: string | null;
  twitter_copy: string | null;
  facebook_copy: string | null;
  image_url: string | null;
  scheduled_date: string | null;
};

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
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

/** Post the first LinkedIn post via LinkedIn REST API (UGC/Posts). Uses OAuth token (refreshed if needed) or LINKEDIN_ACCESS_TOKEN. Person URN from OAuth or LINKEDIN_PERSON_URN env. */
export async function publishToLinkedIn(text: string): Promise<{ ok: boolean; error?: string }> {
  const accessToken = await getLinkedInAccessToken();
  const personUrn = getLinkedInPersonUrn();

  if (!accessToken || !personUrn) {
    return { ok: false, error: "LinkedIn not connected (Connect LinkedIn) or LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN required" };
  }

  try {
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": "202401",
      },
      body: JSON.stringify({
        author: personUrn.startsWith("urn:") ? personUrn : `urn:li:person:${personUrn}`,
        commentary: text,
        visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED" },
        lifecycleState: "PUBLISHED",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `${res.status}: ${err}` };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

function getScheduledContent(): ContentRow[] {
  const db = getDb();
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT id, topic_id, blog_html, linkedin_copy, twitter_copy, facebook_copy, image_url, scheduled_date
       FROM Content
       WHERE status = 'Scheduled' AND scheduled_date IS NOT NULL AND scheduled_date <= ?`
    )
    .all(now) as ContentRow[];
  return rows;
}

function markPublished(contentId: number, topicId: number): void {
  const db = getDb();
  db.prepare(
    "UPDATE Content SET status = 'Published', published_date = ? WHERE id = ?"
  ).run(new Date().toISOString(), contentId);
  db.prepare("UPDATE Topics SET status = 'Published' WHERE id = ?").run(topicId);
}

async function runPublishCycle(): Promise<void> {
  const rows = getScheduledContent();
  for (const row of rows) {
    const blogHtml = row.blog_html ?? "";
    let linkedinCopy: string[] = [];
    let twitterCopy: string[] = [];
    try {
      if (row.linkedin_copy) linkedinCopy = JSON.parse(row.linkedin_copy);
      if (row.twitter_copy) twitterCopy = JSON.parse(row.twitter_copy);
    } catch {
      // ignore
    }
    const firstLinkedIn = linkedinCopy[0]?.trim() || "";
    const firstTwitter = twitterCopy[0]?.trim() || "";
    const facebookMessage = (row.facebook_copy?.trim() || firstLinkedIn).slice(0, 5000);

    // 1) Netlify website: push to GitHub (content source for Netlify), then trigger deploy
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

    // 2) Build public image URL: use row.image_url if already public, else construct from SITE_URL after GitHub success
    let publicImageUrl: string | null =
      row.image_url && row.image_url.startsWith("http") ? row.image_url : null;
    if (!publicImageUrl && ghOk && process.env.SITE_URL) {
      publicImageUrl = `${process.env.SITE_URL.replace(/\/$/, "")}/images/content-${row.id}.jpg`;
    }

    // 3) Meta (Facebook & Instagram) — require public image URL
    if (publicImageUrl && facebookMessage) {
      const fb = await publishToFacebook(row.id, facebookMessage, publicImageUrl);
      if (!fb.ok) console.error("[scheduler] Facebook:", fb.error);
      const ig = await publishToInstagram(row.id, facebookMessage, publicImageUrl);
      if (!ig.ok) console.error("[scheduler] Instagram:", ig.error);
    }

    // 4) X and LinkedIn
    if (firstTwitter) {
      const x = await publishToX(firstTwitter);
      if (!x.ok) console.error("[scheduler] X:", x.error);
    }
    if (firstLinkedIn) {
      const li = await publishToLinkedIn(firstLinkedIn);
      if (!li.ok) console.error("[scheduler] LinkedIn:", li.error);
    }

    markPublished(row.id, row.topic_id);
  }
}

/** Start the hourly cron job. Call from instrumentation (Node only). */
export function startScheduler(): void {
  cron.schedule("0 * * * *", () => {
    runPublishCycle().catch((e) => console.error("[scheduler]", e));
  });
}
