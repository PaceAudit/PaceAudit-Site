import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

/**
 * GET /api/auth/linkedin — redirects to LinkedIn OAuth authorization URL.
 * Uses LINKEDIN_CLIENT_ID and LINKEDIN_REDIRECT_URI (or builds from request).
 */
export async function GET(request: Request) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "LINKEDIN_CLIENT_ID not configured" },
      { status: 500 }
    );
  }

  const scope = "w_member_social openid profile email";
  const state = randomBytes(16).toString("hex");

  let redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  if (!redirectUri) {
    const url = new URL(request.url);
    const base = url.origin;
    redirectUri = `${base}/api/auth/linkedin/callback`;
  }

  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
