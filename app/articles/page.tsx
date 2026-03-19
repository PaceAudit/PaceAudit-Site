"use client";

import { useState, useEffect } from "react";
import { Icon, icons } from "@/components/Icon";

type ArticleItem = { slug: string };

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export default function ArticlesPage() {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [baseUrl, setBaseUrl] = useState("https://www.paceaudit.com");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/articles")
      .then((res) => res.json())
      .then((data: { articles?: ArticleItem[]; baseUrl?: string; error?: string }) => {
        setArticles(Array.isArray(data.articles) ? data.articles : []);
        if (data.baseUrl) setBaseUrl(data.baseUrl.replace(/\/$/, ""));
        if (data.error) setError(data.error);
      })
      .catch(() => setError("Could not load articles"))
      .finally(() => setLoading(false));
  }, []);

  const articleUrl = (slug: string) => `${baseUrl}/articles/${slug}.html`;

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Articles</div>
          <div className="topbar-sub">
            Published articles — open any box to read on the site.
          </div>
        </div>
      </div>

      <div className="content">
        {loading ? (
          <div style={{ color: "var(--text3)", fontSize: 14 }}>Loading articles…</div>
        ) : error && articles.length === 0 ? (
          <div style={{ color: "var(--text3)", fontSize: 14 }}>{error}</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            {articles.map((a) => (
              <a
                key={a.slug}
                href={articleUrl(a.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="article-card"
              >
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {slugToTitle(a.slug)}
                </span>
                <Icon
                  d={icons.external}
                  size={16}
                  style={{ flexShrink: 0, color: "var(--accent)", opacity: 0.9 }}
                />
              </a>
            ))}
          </div>
        )}
        {!loading && articles.length === 0 && !error && (
          <div style={{ color: "var(--text3)", fontSize: 14 }}>No articles published yet.</div>
        )}
      </div>
    </>
  );
}
