import crypto from "crypto";

export type NetlifyDeployResult = {
  ok: boolean;
  url?: string;
  deployId?: string;
  required?: string[];
  error?: string;
};

type CreateDeployResponse = {
  id?: string;
  deploy_id?: string;
  url?: string;
  deploy_url?: string;
  required?: string[];
  required_files?: string[];
  upload_url?: string;
};

function sha1Hex(content: Buffer | string): string {
  return crypto.createHash("sha1").update(content).digest("hex");
}

function normalizeRequired(resp: CreateDeployResponse): string[] {
  const a = Array.isArray(resp.required) ? resp.required : [];
  const b = Array.isArray(resp.required_files) ? resp.required_files : [];
  return [...new Set([...a, ...b].filter((x) => typeof x === "string" && x.trim()))];
}

/**
 * Buildless deploy: uploads/updates a single file in an existing Netlify site
 * without running a build (saves build minutes/credits).
 *
 * Requires:
 * - NETLIFY_AUTH_TOKEN (Personal Access Token)
 * - NETLIFY_SITE_ID (API ID of the site)
 */
export async function deployFileToNetlify(input: {
  filePath: string; // e.g. "articles/my-post.html"
  content: string | Buffer;
  contentType?: string;
}): Promise<NetlifyDeployResult> {
  const token = process.env.NETLIFY_AUTH_TOKEN;
  const siteId = process.env.NETLIFY_SITE_ID;
  if (!token || !siteId) {
    return {
      ok: false,
      error: "NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID are required to publish to Netlify without rebuilds",
    };
  }

  const filePath = String(input.filePath || "").replace(/^\/+/, "");
  if (!filePath) return { ok: false, error: "filePath is required" };

  const contentBuffer = Buffer.isBuffer(input.content)
    ? input.content
    : Buffer.from(String(input.content ?? ""), "utf8");

  const files: Record<string, string> = {
    [filePath]: sha1Hex(contentBuffer),
  };

  let deploy: CreateDeployResponse;
  try {
    const createRes = await fetch(
      `https://api.netlify.com/api/v1/sites/${siteId}/deploys`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files,
          draft: false,
        }),
      }
    );

    const txt = await createRes.text();
    if (!createRes.ok) {
      return { ok: false, error: `Netlify create deploy ${createRes.status}: ${txt.slice(0, 300)}` };
    }
    deploy = (txt ? (JSON.parse(txt) as CreateDeployResponse) : {}) as CreateDeployResponse;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const required = normalizeRequired(deploy);
  const uploadUrl = typeof deploy.upload_url === "string" ? deploy.upload_url : null;
  const deployId = (deploy.id ?? deploy.deploy_id) as string | undefined;
  const url = (deploy.url ?? deploy.deploy_url) as string | undefined;

  // If Netlify says no upload is required, the file is already up to date.
  if (required.length === 0) {
    return { ok: true, url, deployId, required: [] };
  }
  if (!uploadUrl) {
    return { ok: false, error: "Netlify deploy response missing upload_url", deployId, url, required };
  }

  // Upload the required file(s). Here we only support one-file publishes.
  if (!required.includes(filePath)) {
    return { ok: true, url, deployId, required };
  }

  try {
    const putRes = await fetch(`${uploadUrl}/${encodeURI(filePath)}`, {
      method: "PUT",
      headers: {
        "Content-Type": input.contentType ?? "text/html; charset=utf-8",
      },
      body: new Uint8Array(contentBuffer),
    });
    if (!putRes.ok) {
      const err = await putRes.text();
      return { ok: false, error: `Netlify upload ${putRes.status}: ${err.slice(0, 300)}`, deployId, url, required };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), deployId, url, required };
  }

  return { ok: true, url, deployId, required };
}

