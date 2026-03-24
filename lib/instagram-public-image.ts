import { put } from "@vercel/blob";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { deployFileToNetlify } from "@/lib/netlify-deploy";

/** SDK defaults to BLOB_READ_WRITE_TOKEN; allow a custom name from Vercel env UI. */
function getBlobReadWriteToken(): string | undefined {
  const t =
    process.env.BLOB_READ_WRITE_TOKEN?.trim() ||
    process.env.NEW_BLOB_READ_WRITE_TOKEN?.trim();
  return t || undefined;
}

/**
 * Turn a data URL (or pass through http URL) into a URL Instagram's servers can fetch.
 * On Vercel, `public/` is not writable and /tmp is not shared across instances, so we use
 * Vercel Blob. Locally we write under `public/generated` and serve as static files.
 */
export async function resolvePublicImageUrlForInstagram(
  imageUrl: string | null | undefined,
  contentId: number,
  index: number,
  siteUrl: string | undefined
): Promise<string | null> {
  const raw = imageUrl && String(imageUrl).trim();
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  if (!raw.startsWith("data:") || !siteUrl) return null;

  const match = raw.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return null;

  const ext = match[1] === "png" ? "png" : "jpg";
  const base64 = match[2];
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return null;
  }

  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  const filename = `content-${contentId}-ig-${index}.${ext}`;

  if (process.env.VERCEL === "1") {
    let blobMsg = "";
    try {
      const blobToken = getBlobReadWriteToken();
      const blob = await put(`ig-publish/${filename}`, buf, {
        access: "public",
        contentType,
        addRandomSuffix: true,
        ...(blobToken ? { token: blobToken } : {}),
      });
      return blob.url;
    } catch (e) {
      blobMsg = e instanceof Error ? e.message : String(e);
      console.error("[resolvePublicImageUrlForInstagram] Vercel Blob upload failed:", blobMsg);
    }

    // Blob often missing (no store linked) or private; Netlify hosts a public HTTPS file on your site.
    if (process.env.NETLIFY_AUTH_TOKEN && process.env.NETLIFY_SITE_ID) {
      const netlifyPath = `ig-publish/content-${contentId}-ig-${index}-${Date.now()}.${ext}`;
      const net = await deployFileToNetlify({
        filePath: netlifyPath,
        content: buf,
        contentType,
      });
      if (net.ok && net.url) {
        const publicImageUrl = new URL(netlifyPath, `${net.url.replace(/\/$/, "")}/`).href;
        console.log("[resolvePublicImageUrlForInstagram] Netlify fallback URL:", publicImageUrl.slice(0, 80) + "…");
        return publicImageUrl;
      }
      console.error("[resolvePublicImageUrlForInstagram] Netlify fallback failed:", net.error);
    }

    if (/no token/i.test(blobMsg)) {
      throw new Error(
        "Blob token missing: set BLOB_READ_WRITE_TOKEN or NEW_BLOB_READ_WRITE_TOKEN (read/write token from Vercel → Storage → your Blob store), redeploy. Or use NETLIFY_AUTH_TOKEN + NETLIFY_SITE_ID for Netlify image hosting."
      );
    }
    if (/private store|cannot use public access/i.test(blobMsg)) {
      throw new Error(
        "Vercel Blob store is private (public uploads are blocked). Create a public Blob store and link it, or set NETLIFY_AUTH_TOKEN + NETLIFY_SITE_ID for Netlify image hosting."
      );
    }
    if (blobMsg) {
      throw new Error(`Could not upload image for Instagram: ${blobMsg.slice(0, 280)}`);
    }
    return null;
  }

  const dir = join(process.cwd(), "public", "generated");
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, filename);
    writeFileSync(path, buf);
    const base = siteUrl.replace(/\/$/, "");
    return `${base}/generated/${filename}`;
  } catch (e) {
    console.error("[resolvePublicImageUrlForInstagram] local write failed:", e);
    return null;
  }
}

/** Prefer SITE_URL; fall back to this request's origin (works on Vercel when env is unset). */
export function getSiteUrlFromRequest(request: Request): string | undefined {
  const env = process.env.SITE_URL?.trim();
  if (env) return env;
  try {
    return new URL(request.url).origin;
  } catch {
    return undefined;
  }
}
