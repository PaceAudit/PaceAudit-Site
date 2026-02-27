/**
 * Publish to Facebook and Instagram (Meta) via Graph API.
 * Used by the scheduler to send content to Facebook and Meta/Instagram.
 */
const META_API_VERSION = "v19.0";
const META_BASE = "https://graph.facebook.com";

/**
 * Post a photo to a Facebook Page via Graph API.
 * Uses message (facebook_copy or first linkedin_copy) and public image url.
 */
export async function publishToFacebook(
  _contentId: number,
  message: string,
  imageUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!pageId || !accessToken) {
    return { ok: false, error: "FACEBOOK_PAGE_ID and META_ACCESS_TOKEN required" };
  }

  if (!imageUrl || !imageUrl.startsWith("http")) {
    return { ok: false, error: "Public image URL required for Facebook" };
  }

  try {
    const url = new URL(`${META_BASE}/${META_API_VERSION}/${pageId}/photos`);
    url.searchParams.set("url", imageUrl);
    url.searchParams.set("message", message);
    url.searchParams.set("access_token", accessToken);

    const res = await fetch(url.toString(), { method: "POST" });
    const data = (await res.json()) as { error?: { message: string }; id?: string };

    if (!res.ok || data.error) {
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

/**
 * Publish an image to Instagram (two-step: create container, then publish).
 * Uses caption (facebook_copy or first linkedin_copy) and public image_url.
 */
export async function publishToInstagram(
  _contentId: number,
  caption: string,
  imageUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const igAccountId = process.env.INSTAGRAM_ACCOUNT_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;

  if (!igAccountId || !accessToken) {
    return { ok: false, error: "INSTAGRAM_ACCOUNT_ID and META_ACCESS_TOKEN required" };
  }

  if (!imageUrl || !imageUrl.startsWith("http")) {
    return { ok: false, error: "Public image URL required for Instagram" };
  }

  try {
    const createUrl = new URL(`${META_BASE}/${META_API_VERSION}/${igAccountId}/media`);
    createUrl.searchParams.set("image_url", imageUrl);
    createUrl.searchParams.set("caption", caption);
    createUrl.searchParams.set("access_token", accessToken);

    const createRes = await fetch(createUrl.toString(), { method: "POST" });
    const createData = (await createRes.json()) as { error?: { message: string }; id?: string };

    if (!createRes.ok || createData.error) {
      return { ok: false, error: createData.error?.message ?? `Create container: HTTP ${createRes.status}` };
    }

    const creationId = createData.id;
    if (!creationId) {
      return { ok: false, error: "No creation_id in response" };
    }

    const publishUrl = new URL(`${META_BASE}/${META_API_VERSION}/${igAccountId}/media_publish`);
    publishUrl.searchParams.set("creation_id", creationId);
    publishUrl.searchParams.set("access_token", accessToken);

    const publishRes = await fetch(publishUrl.toString(), { method: "POST" });
    const publishData = (await publishRes.json()) as { error?: { message: string }; id?: string };

    if (!publishRes.ok || publishData.error) {
      return { ok: false, error: publishData.error?.message ?? `Publish: HTTP ${publishRes.status}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
