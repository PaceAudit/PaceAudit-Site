"use client";

import { useState } from "react";
import { Icon, icons } from "@/components/Icon";

type PublishResults = {
  x?: { ok: boolean; error?: string };
  linkedin?: { ok: boolean; error?: string };
  facebook?: { ok: boolean; error?: string };
  instagram?: { ok: boolean; error?: string };
};

type PublishResponse = {
  ok: boolean;
  error?: string;
  message?: string;
  tip?: string;
  results?: PublishResults;
};

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<PublishResponse | null>(null);
  const [customText, setCustomText] = useState("");
  const [mode, setMode] = useState<"tip" | "custom">("tip");

  async function handlePostNow() {
    setLoading(true);
    setResponse(null);

    try {
      if (mode === "custom" && customText.trim()) {
        const res = await fetch("/api/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: customText.trim() }),
        });
        const data = (await res.json()) as PublishResponse;
        setResponse(data);
      } else {
        const res = await fetch("/api/publish/daily", { method: "POST" });
        const data = (await res.json()) as PublishResponse;
        if (!res.ok) {
          setResponse({ ok: false, error: data.error ?? `HTTP ${res.status}` });
        } else {
          setResponse(data);
        }
      }
    } catch (e) {
      setResponse({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }

  const platforms = [
    { key: "x", label: "X (Twitter)" },
    { key: "linkedin", label: "LinkedIn" },
    { key: "facebook", label: "Facebook" },
    { key: "instagram", label: "Instagram" },
  ] as const;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="topbar">
        <div>
          <div className="topbar-title">Admin Dashboard</div>
          <div className="topbar-sub">
            Generate and publish content. Use &quot;Post Now&quot; to manually trigger a post for testing.
          </div>
        </div>
      </div>

      <div className="content" style={{ paddingBottom: 80 }}>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon d={icons.send} size={16} />
            Manual Publish
          </div>
          <div className="card-desc" style={{ marginBottom: 16 }}>
            Post Now generates an Audit Tip of the Day (from Gemini + random Turso topic) and publishes to X, LinkedIn, Facebook, and Instagram.
            You can also post custom text (X and LinkedIn support text-only; Facebook and Instagram need an image).
          </div>

          <div style={{ marginBottom: 16 }}>
            <div className="form-label" style={{ marginBottom: 8 }}>Post mode</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "tip"}
                  onChange={() => setMode("tip")}
                />
                <span>Generate Audit Tip + publish</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "custom"}
                  onChange={() => setMode("custom")}
                />
                <span>Custom text</span>
              </label>
            </div>
          </div>

          {mode === "custom" && (
            <div style={{ marginBottom: 16 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>Custom text</div>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Enter text to post to X and LinkedIn..."
                rows={3}
                className="form-input"
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
              />
            </div>
          )}

          <button
            className="btn btn-primary"
            onClick={handlePostNow}
            disabled={loading || (mode === "custom" && !customText.trim())}
          >
            {loading ? "Publishing…" : "Post Now"}
          </button>
        </div>

        {response && (
          <div className="card" style={{ marginBottom: 24 }}>
            <div
              className="card-title"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: response.ok ? "var(--accent)" : "var(--danger)",
              }}
            >
              {response.ok ? (
                <>
                  <Icon d={icons.check} size={16} />
                  Published
                </>
              ) : (
                <>Error</>
              )}
            </div>
            {response.tip && (
              <div
                style={{
                  background: "var(--surface2)",
                  padding: 12,
                  borderRadius: "var(--radius-sm)",
                  marginBottom: 12,
                  fontSize: 13,
                  color: "var(--text2)",
                }}
              >
                &quot;{response.tip}&quot;
              </div>
            )}
            {response.error && (
              <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>
                {response.error}
              </div>
            )}
            {response.results && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {platforms.map((p) => {
                  const r = response.results?.[p.key];
                  if (!r) return null;
                  return (
                    <div
                      key={p.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "var(--surface2)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: "var(--text2)" }}>{p.label}</span>
                      {r.ok ? (
                        <span style={{ color: "var(--accent)" }}>✓</span>
                      ) : (
                        <span style={{ color: "var(--danger)", fontSize: 12 }} title={r.error}>
                          ✗ {r.error?.slice(0, 40)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="card" style={{ borderColor: "var(--border2)" }}>
          <div className="card-title">Daily Cron (9:00 AM UTC)</div>
          <div className="card-desc">
            A Vercel Cron job runs daily at 9:00 AM UTC, generating an Audit Tip and publishing to all platforms.
            Ensure <code>CRON_SECRET</code> is set in Vercel for security.
          </div>
        </div>
      </div>
    </div>
  );
}
