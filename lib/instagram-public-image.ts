import { put } from "@vercel/blob";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

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
    try {
      const blob = await put(`ig-publish/${filename}`, buf, {
        access: "public",
        contentType,
        addRandomSuffix: true,
      });
      return blob.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[resolvePublicImageUrlForInstagram] Vercel Blob upload failed:", msg);
      // Private Blob stores reject public uploads; Instagram needs a URL Meta can fetch without auth.
      if (/private store|cannot use public access/i.test(msg)) {
        throw new Error(
          "Vercel Blob store is private. For Instagram publishing, create a public Blob store (Vercel Dashboard → Storage → Create → Public), connect it to this project, redeploy, and ensure BLOB_READ_WRITE_TOKEN is from that store."
        );
      }
      return null;
    }
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
