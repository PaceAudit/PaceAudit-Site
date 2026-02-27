"use client";

import { useState, useEffect } from "react";
import { Icon, icons } from "@/components/Icon";

type ConnectionStatus = {
  website: boolean;
  netlify: boolean;
  linkedin: boolean;
  twitter: boolean;
  facebook: boolean;
  instagram: boolean;
};

const integrations = [
  {
    id: "website",
    title: "Website (GitHub + Netlify)",
    description: "Publish blog posts to your site. Content is pushed to a GitHub repo; Netlify builds the site.",
    statusKey: "website" as const,
    envVars: [
      "GITHUB_TOKEN",
      "GITHUB_REPO_OWNER",
      "GITHUB_REPO_NAME",
      "GITHUB_CONTENT_PATH (optional, default: content/post.html)",
      "GITHUB_BRANCH (optional, default: main)",
    ],
    docsUrl: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token",
    extra: {
      key: "netlify",
      label: "Netlify deploy hook (triggers build after publish)",
      envVars: ["NETLIFY_DEPLOY_HOOK"],
      docsUrl: "https://docs.netlify.com/site-deploys/overview/#deploy-hooks",
    },
  },
  {
    id: "linkedin",
    title: "LinkedIn",
    description: "Post approved content to your LinkedIn profile.",
    statusKey: "linkedin" as const,
    envVars: ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_PERSON_URN (e.g. urn:li:person:xxxxx)"],
    docsUrl: "https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/sign-in-with-linkedin-v2",
  },
  {
    id: "twitter",
    title: "X (Twitter)",
    description: "Post to X when content is scheduled and published.",
    statusKey: "twitter" as const,
    envVars: [
      "TWITTER_APP_KEY",
      "TWITTER_APP_SECRET",
      "TWITTER_ACCESS_TOKEN",
      "TWITTER_ACCESS_SECRET",
    ],
    docsUrl: "https://developer.x.com/en/docs/authentication/oauth-2-0",
  },
  {
    id: "facebook",
    title: "Facebook Page",
    description: "Post images and copy to your Facebook Page.",
    statusKey: "facebook" as const,
    envVars: ["FACEBOOK_PAGE_ID", "META_ACCESS_TOKEN"],
    docsUrl: "https://developers.facebook.com/docs/pages-api/get-started",
  },
  {
    id: "instagram",
    title: "Instagram",
    description: "Post images with captions to your Instagram Business/Creator account.",
    statusKey: "instagram" as const,
    envVars: ["INSTAGRAM_ACCOUNT_ID", "META_ACCESS_TOKEN"],
    docsUrl: "https://developers.facebook.com/docs/instagram-api/getting-started",
  },
];

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span
      className="badge"
      style={{
        background: connected ? "var(--accent-dim)" : "rgba(248,113,113,0.12)",
        color: connected ? "var(--accent)" : "var(--danger)",
        border: `1px solid ${connected ? "var(--accent-glow)" : "rgba(248,113,113,0.2)"}`,
      }}
    >
      {connected ? "● Connected" : "○ Not connected"}
    </span>
  );
}

export default function ConnectionsPage() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/connections")
      .then((res) => res.json())
      .then((data) => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text3)",
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="topbar">
        <div>
          <div className="topbar-title">Connections</div>
          <div className="topbar-sub">
            Connect your website and social accounts. Set the variables below in{" "}
            <code style={{ background: "var(--surface2)", padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
              .env.local
            </code>{" "}
            and restart the dev server.
          </div>
        </div>
      </div>

      <div className="content" style={{ paddingBottom: 80 }}>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">How to connect</div>
          <div className="card-desc" style={{ marginBottom: 12 }}>
            This app uses environment variables for API keys and tokens. Never commit{" "}
            <code>.env.local</code> to git.
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, color: "var(--text2)", fontSize: 13, lineHeight: 1.8 }}>
            <li>Create a <code>.env.local</code> file in your project root (same folder as <code>package.json</code>).</li>
            <li>Add each variable below (one per line): <code>VARIABLE_NAME=your_value</code></li>
            <li>Restart the dev server (<code>npm run dev</code>) so Next.js picks up changes.</li>
            <li>Return here to confirm each integration shows &quot;Connected&quot;.</li>
          </ol>
        </div>

        {integrations.map((int) => {
          const connected = status ? status[int.statusKey] : false;
          const extra = "extra" in int && int.extra;
          const extraConnected = extra && status ? (status as Record<string, boolean>)[extra.key] : false;

          return (
            <div key={int.id} className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div className="card-title" style={{ marginBottom: 4 }}>{int.title}</div>
                  <div className="card-desc" style={{ marginBottom: 12 }}>{int.description}</div>
                  <StatusBadge connected={connected} />
                  {extra && (
                    <span style={{ marginLeft: 8 }}>
                      <StatusBadge connected={!!extraConnected} />
                      <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 6 }}>{extra.label}</span>
                    </span>
                  )}
                </div>
                {int.docsUrl && (
                  <a
                    href={int.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: 12, padding: "6px 12px" }}
                  >
                    Docs →
                  </a>
                )}
              </div>
              <div style={{ marginTop: 16 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>Required environment variables</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text2)", fontSize: 12.5, lineHeight: 1.9 }}>
                  {int.envVars.map((v) => (
                    <li key={v}>
                      <code style={{ background: "var(--surface2)", padding: "1px 6px", borderRadius: 4 }}>{v}</code>
                    </li>
                  ))}
                </ul>
                {extra && (
                  <>
                    <div className="form-label" style={{ marginTop: 12, marginBottom: 6 }}>{extra.label}</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text2)", fontSize: 12.5, lineHeight: 1.9 }}>
                      {extra.envVars.map((v) => (
                        <li key={v}>
                          <code style={{ background: "var(--surface2)", padding: "1px 6px", borderRadius: 4 }}>{v}</code>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          );
        })}

        <div className="card" style={{ borderColor: "var(--border2)" }}>
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon d={icons.settings} size={14} />
            Optional: Site URL
          </div>
          <div className="card-desc">
            If your blog images are hosted on your site, set <code>SITE_URL</code> (e.g.{" "}
            <code>https://yoursite.com</code>) so Facebook and Instagram can use the correct image URLs.
          </div>
        </div>
      </div>
    </div>
  );
}
