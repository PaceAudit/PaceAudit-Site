import { NextResponse } from "next/server";

/**
 * Returns connection status for each integration.
 * Only reports whether required env vars are set (no secret values).
 */
export async function GET() {
  const website =
    !!(
      process.env.GITHUB_TOKEN &&
      process.env.GITHUB_REPO_OWNER &&
      process.env.GITHUB_REPO_NAME
    );
  const netlify =
    !!(process.env.NETLIFY_DEPLOY_HOOK && process.env.NETLIFY_DEPLOY_HOOK.startsWith("https://"));
  const linkedin =
    !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_PERSON_URN);
  const twitter =
    !!(
      process.env.TWITTER_APP_KEY &&
      process.env.TWITTER_APP_SECRET &&
      process.env.TWITTER_ACCESS_TOKEN &&
      process.env.TWITTER_ACCESS_SECRET
    );
  const facebook =
    !!(process.env.FACEBOOK_PAGE_ID && process.env.META_ACCESS_TOKEN);
  const instagram =
    !!(process.env.INSTAGRAM_ACCOUNT_ID && process.env.META_ACCESS_TOKEN);

  return NextResponse.json({
    website,
    netlify,
    linkedin,
    twitter,
    facebook,
    instagram,
  });
}
