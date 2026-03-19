/**
 * Social Media Publishing Engine
 * Publishes content to X (Twitter), LinkedIn, Facebook, and Instagram.
 */
import { TwitterApi } from "twitter-api-v2";
import { publishToFacebook, publishToInstagram } from "./publish-service";

export type PublishContent = {
  text: string;
  imageUrl?: string | null;
};

export type PublishResult = {
  x?: { ok: boolean; error?: string };
  linkedin?: { ok: boolean; error?: string };
  facebook?: { ok: boolean; error?: string };
  instagram?: { ok: boolean; error?: string };
};

/** Publish text to X (Twitter) via twitter-api-v2. */
async function publishToX(text: string): Promise<{ ok: boolean; error?: string }> {
  const appKey = process.env.TWITTER_APP_KEY;
  const appSecret = process.env.TWITTER_APP_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_SECRET;

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    return { ok: false, error: "TWITTER_APP_KEY, TWITTER_APP_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET required" };
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

/** Publish text to LinkedIn via REST API. */
async function publishToLinkedIn(text: string): Promise<{ ok: boolean; error?: string }> {
  const { getLinkedInAccessToken, getLinkedInPersonUrn } = await import("./linkedin-auth");
  const accessToken = await getLinkedInAccessToken();
  const personUrn = await getLinkedInPersonUrn();

  if (!accessToken || !personUrn) {
    return { ok: false, error: "LinkedIn not connected (Connect LinkedIn) or env vars missing" };
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

/**
 * Publish content to all configured social platforms.
 * X and LinkedIn: text only.
 * Facebook and Instagram: require public imageUrl; skipped if missing.
 */
export async function publishContent(content: PublishContent): Promise<PublishResult> {
  const { text, imageUrl } = content;
  const results: PublishResult = {};

  // X (Twitter) — text only
  try {
    results.x = await publishToX(text);
  } catch (e) {
    results.x = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // LinkedIn — text only
  try {
    results.linkedin = await publishToLinkedIn(text);
  } catch (e) {
    results.linkedin = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Meta (Facebook & Instagram) — require public image URL
  const hasPublicImage = imageUrl && imageUrl.startsWith("http");
  const message = text.slice(0, 5000);

  if (hasPublicImage && message) {
    try {
      results.facebook = await publishToFacebook(0, message, imageUrl);
    } catch (e) {
      results.facebook = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    try {
      results.instagram = await publishToInstagram(0, message, imageUrl);
    } catch (e) {
      results.instagram = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  } else if (!hasPublicImage && message) {
    results.facebook = { ok: false, error: "Public image URL required for Facebook" };
    results.instagram = { ok: false, error: "Public image URL required for Instagram" };
  }

  return results;
}
