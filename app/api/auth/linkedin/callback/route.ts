import { NextRequest, NextResponse } from "next/server";
import { migrateLinkedInTokenColumns } from "@/lib/db";
import { saveLinkedInTokens } from "@/lib/linkedin-auth";

/**
 * GET /api/auth/linkedin/callback — handles redirect from LinkedIn.
 * Exchanges code for access_token and refresh_token, saves to Config / file.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/config?linkedin_error=${encodeURIComponent(error)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/config?linkedin_error=no_code", request.url)
    );
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/config?linkedin_error=missing_credentials", request.url)
    );
  }

  let redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  if (!redirectUri) {
    const url = new URL(request.url);
    redirectUri = `${url.origin}/api/auth/linkedin/callback`;
  }

  try {
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
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

    if (!res.ok || !data.access_token) {
      const err = data.error ?? `HTTP ${res.status}`;
      return NextResponse.redirect(
        new URL(`/config?linkedin_error=${encodeURIComponent(err)}`, request.url)
      );
    }

    migrateLinkedInTokenColumns();

    let personUrn: string | null = null;
    try {
      const userInfoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (userInfoRes.ok) {
        const userInfo = (await userInfoRes.json()) as { sub?: string };
        const sub = userInfo.sub;
        if (typeof sub === "string" && sub) {
          personUrn = `urn:li:person:${sub}`;
        }
      }
    } catch {
      /* ignore — person URN optional */
    }

    await saveLinkedInTokens(
      data.access_token,
      data.refresh_token ?? "",
      personUrn
    );

    return NextResponse.redirect(
      new URL("/config?linkedin_connected=1", request.url)
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.redirect(
      new URL(`/config?linkedin_error=${encodeURIComponent(msg)}`, request.url)
    );
  }
}
