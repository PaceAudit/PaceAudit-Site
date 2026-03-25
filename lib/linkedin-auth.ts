/**
 * LinkedIn OAuth 2.0 token management.
 * Stores tokens in Config table (when db persists) or falls back to JSON file.
 */
import { getDb } from "./db";

const LINKEDIN_TOKENS_FILE = ".linkedin-tokens.json";

type TokenRecord = {
  access_token: string;
  refresh_token: string;
};

/** Read tokens from Config table or JSON file fallback. */
export async function getLinkedInTokens(): Promise<TokenRecord | null> {
  try {
    const db = await getDb();
    const raw = await db
      .prepare(
        "SELECT linkedin_access_token, linkedin_refresh_token FROM Config WHERE id = 1"
      )
      .get();
    const row = raw as unknown as { linkedin_access_token: string | null; linkedin_refresh_token: string | null } | undefined;

    if (row && row.linkedin_access_token && row.linkedin_refresh_token) {
      return {
        access_token: row.linkedin_access_token,
        refresh_token: row.linkedin_refresh_token,
      };
    }
  } catch {
    // DB stub or Config columns don't exist
  }

  // Fallback: JSON file (works when db is stub)
  try {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(process.cwd(), LINKEDIN_TOKENS_FILE);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (data.access_token && data.refresh_token) {
        return { access_token: data.access_token, refresh_token: data.refresh_token };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/** Read LinkedIn person URN from Config table or JSON file. Falls back to LINKEDIN_PERSON_URN env. */
export async function getLinkedInPersonUrn(): Promise<string | null> {
  try {
    const db = await getDb();
    const raw = await db
      .prepare("SELECT linkedin_person_urn FROM Config WHERE id = 1")
      .get();
    const row = raw as unknown as { linkedin_person_urn: string | null } | undefined;
    if (row?.linkedin_person_urn) return row.linkedin_person_urn;
  } catch {
    /* ignore */
  }
  try {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(process.cwd(), LINKEDIN_TOKENS_FILE);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (data.person_urn) return data.person_urn;
    }
  } catch {
    /* ignore */
  }
  return process.env.LINKEDIN_PERSON_URN ?? null;
}

/**
 * URN used as `author` on POST /rest/posts.
 * - If LINKEDIN_ORGANIZATION_URN is set → post as that Company Page (needs w_organization_social + reconnect).
 * - Else → member profile from Config / LINKEDIN_PERSON_URN (w_member_social).
 */
export async function getLinkedInPostsAuthorUrn(): Promise<string | null> {
  const orgRaw = process.env.LINKEDIN_ORGANIZATION_URN?.trim();
  if (orgRaw) {
    if (orgRaw.startsWith("urn:li:organization:")) return orgRaw;
    const id = orgRaw.replace(/^urn:li:organization:/i, "").trim();
    return id ? `urn:li:organization:${id}` : null;
  }

  const person = await getLinkedInPersonUrn();
  if (!person) return null;
  if (person.startsWith("urn:li:person:") || person.startsWith("urn:li:organization:")) {
    return person;
  }
  if (person.startsWith("urn:")) return person;
  return `urn:li:person:${person}`;
}

/** YYYYMM; older values are sunset. Override with LINKEDIN_API_VERSION. */
const LINKEDIN_REST_API_VERSION =
  (typeof process !== "undefined" && process.env.LINKEDIN_API_VERSION?.trim()) || "202510";

/** POST /rest/posts — personal profile or Company Page (see LINKEDIN_ORGANIZATION_URN + w_organization_social). */
export async function publishLinkedInPost(text: string): Promise<{ ok: boolean; error?: string }> {
  const accessToken = await getLinkedInAccessToken();
  const authorUrn = await getLinkedInPostsAuthorUrn();

  if (!accessToken || !authorUrn) {
    return { ok: false, error: "LinkedIn not connected (Connect LinkedIn) or LINKEDIN_ACCESS_TOKEN and author URN required" };
  }

  const postingAsOrg = authorUrn.startsWith("urn:li:organization:");
  const orgPostingEnabled = !!process.env.LINKEDIN_ORGANIZATION_URN?.trim();
  if (postingAsOrg && !orgPostingEnabled) {
    return {
      ok: false,
      error:
        "LinkedIn author is a Company Page (urn:li:organization:…), but your connection only has personal posting. Either: (1) Clear the wrong URN and reconnect LinkedIn so a personal urn:li:person:… is saved, or (2) Set LINKEDIN_ORGANIZATION_URN to that company ID, add w_organization_social in your LinkedIn app, ensure you’re an admin, then Connect LinkedIn again.",
    };
  }

  try {
    const res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
        "LinkedIn-Version": LINKEDIN_REST_API_VERSION,
      },
      body: JSON.stringify({
        author: authorUrn,
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

/** Save tokens and optional person URN to Config and JSON file. When person_urn is undefined, only tokens are updated (preserves existing URN). */
export async function saveLinkedInTokens(
  access_token: string,
  refresh_token: string,
  person_urn?: string | null
): Promise<void> {
  try {
    const db = await getDb();
    if (person_urn !== undefined) {
      await db.prepare(
        "UPDATE Config SET linkedin_access_token = ?, linkedin_refresh_token = ?, linkedin_person_urn = ? WHERE id = 1"
      ).run(access_token, refresh_token, person_urn ?? null);
    } else {
      await db.prepare(
        "UPDATE Config SET linkedin_access_token = ?, linkedin_refresh_token = ? WHERE id = 1"
      ).run(access_token, refresh_token);
    }
  } catch {
    // DB stub or Config columns don't exist
  }

  try {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(process.cwd(), LINKEDIN_TOKENS_FILE);
    const payload: Record<string, string> = { access_token, refresh_token };
    try {
      const existing = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : {};
      if (person_urn !== undefined) payload.person_urn = person_urn ?? "";
      else if (existing.person_urn) payload.person_urn = existing.person_urn;
    } catch {
      if (person_urn) payload.person_urn = person_urn;
    }
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    console.error("Failed to save LinkedIn tokens to file");
  }
}

/**
 * Refresh LinkedIn access token using refresh_token.
 * Saves new access_token back to Config/file.
 */
export async function refreshLinkedInTokenIfNeeded(): Promise<string | null> {
  const tokens = await getLinkedInTokens();
  if (!tokens?.refresh_token) return null;

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return tokens.access_token; // use existing
  }

  try {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    };

    if (res.ok && data.access_token) {
      await saveLinkedInTokens(
        data.access_token,
        data.refresh_token ?? tokens.refresh_token
      );
      return data.access_token;
    }
  } catch (e) {
    console.error("[linkedin-auth] refresh failed:", e);
  }

  return tokens.access_token; // fallback to existing
}

/** Get access token, refreshing if needed. */
export async function getLinkedInAccessToken(): Promise<string | null> {
  const refreshed = await refreshLinkedInTokenIfNeeded();
  if (refreshed) return refreshed;

  // Fallback to env var
  return process.env.LINKEDIN_ACCESS_TOKEN ?? null;
}
