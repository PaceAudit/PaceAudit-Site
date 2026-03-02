"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon, icons } from "@/components/Icon";
import { Toast } from "@/components/Toast";

const LINKEDIN_COUNT = 3;
const TWITTER_COUNT = 6;
const INSTAGRAM_COUNT = 3;
const MAX_TABS = 10;

type Topic = { id: number; title: string; keyword: string; angle: string; persona: string; status: string };

type SocialPost = {
  text: string;
  datetime: string; // datetime-local value
  imageUrl?: string;
};

type Slot = {
  id: string;
  blogDate: string; // YYYY-MM-DD for tab label
  topicId: number | null;
  topicTitle: string;
  blogHtml: string;
  coverImageUrl: string | null;
  linkedin: SocialPost[];
  twitter: SocialPost[];
  instagram: SocialPost[];
};

function defaultDatetime(dayOffset: number, hour: number = 9): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString().slice(0, 16);
}

function defaultSlot(
  id: string,
  blogDateOffset: number,
  topicId: number | null = null,
  topicTitle: string = ""
): Slot {
  const blogDate = new Date();
  blogDate.setDate(blogDate.getDate() + blogDateOffset);
  const blogDateStr = blogDate.toISOString().slice(0, 10);
  return {
    id,
    blogDate: blogDateStr,
    topicId,
    topicTitle,
    blogHtml: "",
    coverImageUrl: null,
    linkedin: Array.from({ length: LINKEDIN_COUNT }, (_, i) => ({
      text: "",
      datetime: defaultDatetime(blogDateOffset + i),
      imageUrl: undefined,
    })),
    twitter: Array.from({ length: TWITTER_COUNT }, (_, i) => ({
      text: "",
      datetime: defaultDatetime(blogDateOffset + Math.floor(i / 2), 9 + (i % 2) * 4),
    })),
    instagram: Array.from({ length: INSTAGRAM_COUNT }, (_, i) => ({
      text: "",
      datetime: defaultDatetime(blogDateOffset + i, 12),
      imageUrl: undefined,
    })),
  };
}

function buildSlotsFromTopics(topics: Topic[]): Slot[] {
  return Array.from({ length: MAX_TABS }, (_, i) => {
    const topic = topics[i % topics.length];
    return defaultSlot(
      `slot-${Date.now()}-${i}`,
      i,
      topic?.id ?? null,
      topic?.title ?? ""
    );
  });
}

const pad = <T,>(arr: T[], n: number, fill: T): T[] =>
  arr.length >= n ? arr.slice(0, n) : [...arr, ...Array(n - arr.length).fill(fill)];

export default function ReviewPage() {
  const [reviewTopics, setReviewTopics] = useState<Topic[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [toast, setToast] = useState(false);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [generatingImageFor, setGeneratingImageFor] = useState<string | null>(null);

  // Load topics (Review), then build one slot per day, each day = one topic (round-robin).
  useEffect(() => {
    fetch("/api/topics?status=Review")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setReviewTopics(list);
        setSlots(list.length > 0 ? buildSlotsFromTopics(list) : []);
      })
      .catch(() => {
        setReviewTopics([]);
        setSlots([]);
      })
      .finally(() => setLoadingTopics(false));
  }, []);

  // For each slot with a topic and no content yet, fetch content; if missing, generate then fetch.
  useEffect(() => {
    const toLoad = slots.filter((s) => s.topicId != null && s.blogHtml === "");
    if (toLoad.length === 0) return;

    let cancelled = false;
    setLoadingContent(true);

    Promise.all(
      toLoad.map(async (slot) => {
        const topicId = slot.topicId!;
        let data: Record<string, unknown> | null = await fetch(
          `/api/content?topicId=${topicId}`
        ).then((r) => r.json());
        if (data == null) {
          await fetch(`/api/generate?topicId=${topicId}`, { method: "POST" });
          data = await fetch(`/api/content?topicId=${topicId}`).then((r) => r.json());
        }
        return { slotId: slot.id, data };
      })
    )
      .then((results) => {
        if (cancelled) return;
        setSlots((prev) =>
          prev.map((s) => {
            const r = results.find((x) => x.slotId === s.id);
            if (!r || !r.data) return s;
            const d = r.data as {
              blog_html?: string;
              linkedin_copy?: string[];
              twitter_copy?: string[];
              image_url?: string | null;
              scheduled_date?: string | null;
            };
            const li = pad(
              Array.isArray(d.linkedin_copy) ? d.linkedin_copy : [],
              LINKEDIN_COUNT,
              ""
            );
            const tw = pad(
              Array.isArray(d.twitter_copy) ? d.twitter_copy : [],
              TWITTER_COUNT,
              ""
            );
            const scheduled = d.scheduled_date
              ? String(d.scheduled_date).slice(0, 16)
              : null;
            return {
              ...s,
              blogHtml: d.blog_html ?? "",
              coverImageUrl: d.image_url ?? null,
              linkedin: s.linkedin.map((p, i) => ({
                ...p,
                text: li[i] ?? "",
                datetime: scheduled ?? p.datetime,
              })),
              twitter: s.twitter.map((p, i) => ({
                ...p,
                text: tw[i] ?? "",
                datetime: scheduled ?? p.datetime,
              })),
              instagram: s.instagram.map((p) => ({
                ...p,
                datetime: scheduled ?? p.datetime,
              })),
            };
          })
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slots]);

  const activeSlot = slots[activeTabIndex];
  const setActiveSlot = (updater: (s: Slot) => Slot) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === activeTabIndex ? updater(s) : s))
    );
  };

  const handleMarkAsPosted = () => {
    const topic = reviewTopics[slots.length % Math.max(1, reviewTopics.length)];
    setSlots((prev) => {
      const rest = prev.slice(1);
      const nextId = `slot-${Date.now()}`;
      const lastDate = rest.length > 0 ? rest[rest.length - 1].blogDate : activeSlot.blogDate;
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const newSlot = defaultSlot(
        nextId,
        prev.length,
        topic?.id ?? null,
        topic?.title ?? ""
      );
      newSlot.blogDate = nextDate.toISOString().slice(0, 10);
      return [...rest, newSlot];
    });
    setActiveTabIndex((i) => (i >= 1 ? i - 1 : 0));
    setToast(true);
    setTimeout(() => setToast(false), 3000);
  };

  const saveCurrentSlot = () => {
    if (activeSlot?.topicId == null || !activeSlot) return;
    fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic_id: activeSlot.topicId,
        blog_html: activeSlot.blogHtml,
        linkedin_copy: activeSlot.linkedin.map((p) => p.text),
        twitter_copy: activeSlot.twitter.map((p) => p.text),
        facebook_copy: activeSlot.instagram[0]?.text ?? "",
        image_url: activeSlot.coverImageUrl ?? null,
        scheduled_date: activeSlot.linkedin[0]?.datetime ?? null,
        status: "Scheduled",
      }),
    })
      .then((res) => {
        if (res.ok) {
          setToast(true);
          setTimeout(() => setToast(false), 3000);
        }
      })
      .catch(() => {});
  };

  const generateImage = async (prompt: string, key: string): Promise<string | null> => {
    setGeneratingImageFor(key);
    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.url) return data.url as string;
    } catch (_) {}
    setGeneratingImageFor(null);
    return null;
  };

  const handleGenerateCoverImage = () => {
    const topic = activeSlot?.topicTitle
      ? { title: activeSlot.topicTitle }
      : null;
    const prompt = topic
      ? `Featured image for blog post. Topic: ${topic.title}. Professional, clean, editorial. High quality, no text in image.`
      : "Professional blog featured image.";
    generateImage(prompt, "cover").then((url) => {
      if (url) setActiveSlot((s) => ({ ...s, coverImageUrl: url }));
      setGeneratingImageFor(null);
    });
  };

  const handleGenerateLinkedInImage = (index: number) => {
    const prompt = activeSlot?.linkedin[index]?.text?.slice(0, 200) || "Professional social media image.";
    generateImage(prompt, `li-${index}`).then((url) => {
      if (url)
        setActiveSlot((s) => ({
          ...s,
          linkedin: s.linkedin.map((p, i) => (i === index ? { ...p, imageUrl: url } : p)),
        }));
      setGeneratingImageFor(null);
    });
  };

  const handleGenerateInstagramImage = (index: number) => {
    const prompt = activeSlot?.instagram[index]?.text?.slice(0, 200) || "Instagram post image, square format.";
    generateImage(prompt, `ig-${index}`).then((url) => {
      if (url)
        setActiveSlot((s) => ({
          ...s,
          instagram: s.instagram.map((p, i) => (i === index ? { ...p, imageUrl: url } : p)),
        }));
      setGeneratingImageFor(null);
    });
  };

  if (loadingTopics) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="topbar">
        <div>
          <div className="topbar-title">Content Queue</div>
          <div className="topbar-sub">
            One topic per day; content is auto-generated. Each tab = one day. Up to {MAX_TABS} days.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {reviewTopics.length === 0 && (
            <span style={{ color: "var(--text3)", fontSize: 13 }}>No topics in Review — add topics and set status to Review</span>
          )}
          <button
            className="btn btn-primary"
            onClick={saveCurrentSlot}
            disabled={activeSlot?.topicId == null || !activeSlot}
          >
            <Icon d={icons.check} size={14} /> Save & Schedule
          </button>
        </div>
      </div>

      {/* Tabs: names = blog post date */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "0 32px",
          borderBottom: "1px solid var(--border)",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {slots.map((slot, i) => (
          <button
            key={slot.id}
            type="button"
            onClick={() => setActiveTabIndex(i)}
            style={{
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 600,
              color: activeTabIndex === i ? "var(--accent)" : "var(--text2)",
              background: activeTabIndex === i ? "var(--accent-dim)" : "transparent",
              border: "1px solid transparent",
              borderBottom: activeTabIndex === i ? "2px solid var(--accent)" : "2px solid transparent",
              borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {new Date(slot.blogDate + "T12:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            {slot.topicTitle && (
              <span style={{ marginLeft: 6, fontWeight: 400, color: "var(--text3)" }}>
                · {slot.topicTitle.slice(0, 20)}{slot.topicTitle.length > 20 ? "…" : ""}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="content" style={{ overflowY: "auto" }}>
        {loadingContent && (
          <div style={{ marginBottom: 16, color: "var(--text3)", fontSize: 13 }}>Loading content…</div>
        )}
        {!activeSlot ? (
          <div style={{ color: "var(--text3)" }}>No slot selected.</div>
        ) : (
          <div className="review-grid">
            {/* Left: Blog + cover image */}
            <div>
              <div style={{ marginBottom: 16 }}>
                <span className="form-label">Blog Post (publishes {activeSlot.blogDate})</span>
              </div>
              <div
                className="image-placeholder"
                onClick={activeSlot.coverImageUrl ? undefined : handleGenerateCoverImage}
                style={activeSlot.coverImageUrl ? { padding: 0, height: 200 } : {}}
              >
                {activeSlot.coverImageUrl ? (
                  <img
                    src={activeSlot.coverImageUrl}
                    alt="Cover"
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--radius-sm)" }}
                  />
                ) : (
                  <>
                    <Icon d={icons.image} size={28} />
                    <span>AI Cover Image</span>
                    <span style={{ fontSize: 11 }}>
                      {generatingImageFor === "cover" ? "Generating…" : "Click to generate"}
                    </span>
                  </>
                )}
              </div>
              {activeSlot.coverImageUrl && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginTop: 8, fontSize: 12 }}
                  onClick={handleGenerateCoverImage}
                  disabled={!!generatingImageFor}
                >
                  {generatingImageFor === "cover" ? "Generating…" : "Regenerate image"}
                </button>
              )}
              <div className="form-group" style={{ marginTop: 16, marginBottom: 0 }}>
                <label className="form-label">HTML Content</label>
                <textarea
                  rows={18}
                  value={activeSlot.blogHtml}
                  onChange={(e) => setActiveSlot((s) => ({ ...s, blogHtml: e.target.value }))}
                  placeholder="Blog HTML…"
                  style={{ fontFamily: "monospace", fontSize: 12.5, lineHeight: 1.6 }}
                />
              </div>
            </div>

            {/* Right: Social with date/time + image gen */}
            <div>
              <div style={{ marginBottom: 16 }}>
                <span className="form-label">Social (3 days per tab)</span>
              </div>

              {/* LinkedIn — 3 variations, optional image */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>LinkedIn</span>
                  3 variations
                </div>
                {activeSlot.linkedin.map((p, i) => (
                  <div key={i} className="social-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="social-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                      <span>Variation {i + 1}</span>
                      <input
                        type="datetime-local"
                        value={p.datetime}
                        onChange={(e) =>
                          setActiveSlot((s) => ({
                            ...s,
                            linkedin: s.linkedin.map((x, j) => (j === i ? { ...x, datetime: e.target.value } : x)),
                          }))
                        }
                        style={{ width: 180, fontSize: 11 }}
                      />
                    </div>
                    {p.imageUrl && (
                      <img src={p.imageUrl} alt="" style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 6 }} />
                    )}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <textarea
                        rows={3}
                        value={p.text}
                        placeholder="LinkedIn post…"
                        onChange={(e) =>
                          setActiveSlot((s) => ({
                            ...s,
                            linkedin: s.linkedin.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                          }))
                        }
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "6px 10px", fontSize: 11 }}
                        onClick={() => handleGenerateLinkedInImage(i)}
                        disabled={!!generatingImageFor}
                        title="Generate photo for LinkedIn (optional)"
                      >
                        {generatingImageFor === `li-${i}` ? "…" : "📷"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Twitter — 6 posts */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text2)", marginBottom: 10 }}>
                  <span style={{ background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>𝕏 / Twitter</span>
                  {" "}6 posts
                </div>
                {activeSlot.twitter.map((p, i) => (
                  <div key={i} className="social-card">
                    <div className="social-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Post {i + 1}</span>
                      <input
                        type="datetime-local"
                        value={p.datetime}
                        onChange={(e) =>
                          setActiveSlot((s) => ({
                            ...s,
                            twitter: s.twitter.map((x, j) => (j === i ? { ...x, datetime: e.target.value } : x)),
                          }))
                        }
                        style={{ width: 180, fontSize: 11 }}
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={p.text}
                      placeholder="Tweet…"
                      onChange={(e) =>
                        setActiveSlot((s) => ({
                          ...s,
                          twitter: s.twitter.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                        }))
                      }
                    />
                    <span style={{ fontSize: 11, color: p.text.length > 280 ? "var(--danger)" : "var(--text3)" }}>{p.text.length}/280</span>
                  </div>
                ))}
              </div>

              {/* Instagram — 3 variations, required image */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)", marginBottom: 10 }}>
                  <span style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-glow)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>Instagram</span>
                  {" "}3 variations (photo required)
                </div>
                {activeSlot.instagram.map((p, i) => (
                  <div key={i} className="social-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="social-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                      <span>Post {i + 1}</span>
                      <input
                        type="datetime-local"
                        value={p.datetime}
                        onChange={(e) =>
                          setActiveSlot((s) => ({
                            ...s,
                            instagram: s.instagram.map((x, j) => (j === i ? { ...x, datetime: e.target.value } : x)),
                          }))
                        }
                        style={{ width: 180, fontSize: 11 }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div
                        className="image-placeholder"
                        onClick={!p.imageUrl ? () => handleGenerateInstagramImage(i) : undefined}
                        style={{ width: 100, height: 100, flexShrink: 0 }}
                      >
                        {p.imageUrl ? (
                          <img src={p.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }} />
                        ) : (
                          <span style={{ fontSize: 10 }}>{generatingImageFor === `ig-${i}` ? "Generating…" : "Generate photo"}</span>
                        )}
                      </div>
                      {p.imageUrl && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 11 }}
                          onClick={() => handleGenerateInstagramImage(i)}
                          disabled={!!generatingImageFor}
                        >
                          Regenerate
                        </button>
                      )}
                      <textarea
                        rows={3}
                        value={p.text}
                        placeholder="Caption…"
                        onChange={(e) =>
                          setActiveSlot((s) => ({
                            ...s,
                            instagram: s.instagram.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                          }))
                        }
                        style={{ flex: 1 }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleMarkAsPosted}
                  title="Simulate first tab posted: tabs slide up, new tab at end"
                >
                  Mark first as posted (slide tabs)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && <Toast msg="Saved / Tabs updated" />}
    </div>
  );
}
