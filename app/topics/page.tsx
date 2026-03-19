"use client";

import { useState, useEffect, useRef } from "react";
import { Icon, icons } from "@/components/Icon";
import { Modal } from "@/components/Modal";
import { RegenerateContextModal } from "@/components/RegenerateContextModal";

type Topic = {
  id: number;
  title: string;
  keyword: string;
  angle: string;
  persona: string;
  status: string;
  topic_tag?: string;
  intent_arc?: string;
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    Pending: "badge-pending",
    Generating: "badge-generating",
    Review: "badge-review",
    Approved: "badge-review",
    Published: "badge-published",
    Error: "badge-pending",
  };
  return <span className={`badge ${map[s] ?? "badge-pending"}`}>{s}</span>;
}

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    keyword: "",
    angle: "",
    persona: "",
    topic_tag: "",
    intent_arc: "",
  });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const rateLimitTimerRef = useRef<number | null>(null);
  const [isBatching, setIsBatching] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);
  const [regenerateTopicId, setRegenerateTopicId] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < topics.length;
  }, [selectedIds, topics.length]);

  const fetchTopics = () => {
    fetch("/api/topics")
      .then((res) => res.json())
      .then((data) => setTopics(Array.isArray(data) ? data.map((t: Topic) => ({ ...t, topic_tag: t.topic_tag ?? "", intent_arc: t.intent_arc ?? "" })) : []))
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTopics();
  }, []);

  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) window.clearTimeout(rateLimitTimerRef.current);
    };
  }, []);

  const handleAdd = () => {
    if (!form.title.trim()) return;
    fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title.trim(),
        keyword: form.keyword,
        angle: form.angle,
        persona: form.persona,
        topic_tag: form.topic_tag,
        intent_arc: form.intent_arc,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.id != null) {
          setTopics((t) => [{
            ...data,
            keyword: data.keyword ?? "",
            angle: data.angle ?? "",
            persona: data.persona ?? "",
            topic_tag: data.topic_tag ?? "",
            intent_arc: data.intent_arc ?? "",
          }, ...t]);
          setForm({ title: "", keyword: "", angle: "", persona: "", topic_tag: "", intent_arc: "" });
          setModalOpen(false);
        }
      })
      .catch(() => {});
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".txt") && !name.endsWith(".html") && !name.endsWith(".htm")) {
      alert("Please upload a .txt or .html file.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    fetch("/api/topics/from-file", { method: "POST", body: formData })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          alert(data.error);
          return;
        }
        const list = Array.isArray(data.topics) ? data.topics : [];
        if (list.length > 0) {
          const newTopics: Topic[] = list.map((item: { id: number; title?: string; keyword?: string; angle?: string; persona?: string; status?: string; topic_tag?: string; intent_arc?: string }) => ({
            id: item.id,
            title: item.title ?? "",
            keyword: item.keyword ?? "",
            angle: item.angle ?? "",
            persona: item.persona ?? "",
            status: item.status ?? "Pending",
            topic_tag: item.topic_tag ?? "",
            intent_arc: item.intent_arc ?? "",
          }));
          setTopics((t) => [...newTopics, ...t]);
          setModalOpen(false);
          alert(`Added ${list.length} topic${list.length !== 1 ? "s" : ""}.`);
        }
      })
      .catch(() => alert("Upload failed"))
      .finally(() => {
        setUploading(false);
        e.target.value = "";
      });
  };

  const handleGenerate = (id: number) => {
    if (rateLimited) return;
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const myId = ++requestIdRef.current;
    const signal = abortControllerRef.current.signal;
    setGenerating(id);

    fetch(`/api/topics/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Generating" }),
    }).then((res) => res.ok && setTopics((t) => t.map((x) => (x.id === id ? { ...x, status: "Generating" } : x))));

    fetch(`/api/generate?topicId=${id}`, { method: "POST", signal })
      .then((res) => {
        const ok = res.ok;
        if (res.status === 429) {
          setRateLimited(true);
          if (rateLimitTimerRef.current) window.clearTimeout(rateLimitTimerRef.current);
          rateLimitTimerRef.current = window.setTimeout(() => setRateLimited(false), 60_000);
        }
        return res.text().then((text) => {
          let data: { content?: Record<string, unknown>; error?: string } = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch {
            return { ok, error: "Invalid response" };
          }
          if (ok && data.content && typeof data.content === "object") {
            try {
              sessionStorage.setItem(`content-app:content:${id}`, JSON.stringify(data.content));
              sessionStorage.setItem("content-app:lastGeneratedTopicId", String(id));
            } catch {
              /* ignore */
            }
          }
          return { ok, error: data?.error };
        });
      })
      .then(({ ok, error }) => {
        if (myId !== requestIdRef.current) return; // overridden
        if (ok) {
          setTopics((t) => t.map((x) => (x.id === id ? { ...x, status: "Review" } : x)));
        } else if (error) {
          setTopics((t) => t.map((x) => (x.id === id ? { ...x, status: "Pending" } : x)));
          fetch(`/api/topics/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Pending" }),
          }).catch(() => {});
          alert(error);
        }
      })
      .catch((err) => {
        if (myId !== requestIdRef.current || err?.name === "AbortError") return; // overridden or aborted
        setTopics((t) => t.map((x) => (x.id === id ? { ...x, status: "Pending" } : x)));
        fetch(`/api/topics/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Pending" }),
        }).catch(() => {});
        alert("Generation failed");
      })
      .finally(() => {
        if (myId === requestIdRef.current) setGenerating(null);
      });
  };

  const handleRegenerateAll = async (context: string) => {
    const ids = selectedIds.size > 0 ? Array.from(selectedIds) : (regenerateTopicId != null ? [regenerateTopicId] : []);
    if (ids.length === 0 || regenerating || rateLimited) return;
    setRegenerating(true);
    try {
      for (let i = 0; i < ids.length; i++) {
        const topicId = ids[i]!;
        const res = await fetch("/api/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topicId, scope: "all", context }),
        });
        const data = (await res.json().catch(() => ({}))) as { ok?: boolean; content?: Record<string, unknown>; error?: string };
        if (!res.ok) {
          alert(data?.error ?? `Regeneration failed for topic ${topicId}`);
          continue;
        }
        if (data.content) {
          try {
            sessionStorage.setItem(`content-app:content:${topicId}`, JSON.stringify(data.content));
            sessionStorage.setItem("content-app:lastGeneratedTopicId", String(topicId));
          } catch {
            /* ignore */
          }
        }
      }
      fetchTopics();
      setRegenerateModalOpen(false);
      setRegenerateTopicId(null);
      setSelectedIds(new Set());
    } catch {
      alert("Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === topics.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(topics.map((t) => t.id)));
  };

  const handleMassDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} topic(s)? This cannot be undone.`)) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await fetch(`/api/topics/${id}`, { method: "DELETE" }).catch(() => {});
    }
    setTopics((t) => t.filter((x) => !ids.includes(x.id)));
    setSelectedIds(new Set());
  };

  const openRegenerateModal = (topicId: number | null) => {
    if (topicId != null) setSelectedIds(new Set());
    setRegenerateTopicId(topicId);
    setRegenerateModalOpen(true);
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this topic?")) return;
    fetch(`/api/topics/${id}`, { method: "DELETE" })
      .then((res) => res.ok && setTopics((t) => t.filter((x) => x.id !== id)))
      .catch(() => {});
  };

  const handleGenerateAll = async () => {
    if (isBatching) return;
    setIsBatching(true);
    setBatchProgress("Fetching pending topics…");

    try {
      const pending = (await fetch("/api/topics?status=Pending").then((r) =>
        r.json()
      )) as Topic[];
      const list = Array.isArray(pending) ? pending : [];

      if (list.length === 0) {
        alert("No Pending topics to generate.");
        setBatchProgress("");
        return;
      }

      // One request per topic (no batch body); each topic gets its own POST /api/generate
      for (let i = 0; i < list.length; i++) {
        const topic = list[i]!;
        setBatchProgress(`Processing ${i + 1} of ${list.length}: ${topic.title}`);

        // Set status to Generating in UI + DB
        setTopics((t) => t.map((x) => (x.id === topic.id ? { ...x, status: "Generating" } : x)));
        fetch(`/api/topics/${topic.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "Generating" }),
        }).catch(() => {});

        let success = false;
        try {
          const res = await fetch(`/api/generate?topicId=${topic.id}`, { method: "POST" });
          const data = (await res.json().catch(() => ({}))) as {
            success?: boolean;
            error?: string;
            content?: Record<string, unknown>;
          };
          if (!res.ok) {
            throw new Error(data?.error ?? `HTTP ${res.status}`);
          }
          if (data.success === false) {
            console.error(`[topics] Batch error for topic "${topic.title}" (id=${topic.id}):`, data.error);
            setTopics((t) => t.map((x) => (x.id === topic.id ? { ...x, status: "Error" } : x)));
            fetch(`/api/topics/${topic.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "Error" }),
            }).catch(() => {});
          } else {
            success = true;
            setTopics((t) => t.map((x) => (x.id === topic.id ? { ...x, status: "Review" } : x)));
          }
        } catch (e) {
          console.error(`[topics] Batch error for topic "${topic.title}" (id=${topic.id}):`, e);
          setTopics((t) => t.map((x) => (x.id === topic.id ? { ...x, status: "Error" } : x)));
          fetch(`/api/topics/${topic.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "Error" }),
          }).catch(() => {});
        }

        // 90s stagger between topics to stay within paid-tier limits for batch
        if (i < list.length - 1) {
          setBatchProgress(
            success
              ? `Waiting 90s before next topic (${i + 1} of ${list.length} done)…`
              : `Topic had an error; waiting 90s before next (${i + 1} of ${list.length})…`
          );
          await new Promise((r) => setTimeout(r, 90_000));
        }
      }

      setBatchProgress("Batch complete.");
      // Refresh to ensure everything is in sync
      fetchTopics();
      setTimeout(() => setBatchProgress(""), 2500);
    } catch (e) {
      console.error("[topics] batch generate failed", e);
      alert("Batch stopped due to error.");
      setBatchProgress("");
    } finally {
      setIsBatching(false);
    }
  };

  if (loading) {
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
          <div className="topbar-title">Topic Database</div>
          <div className="topbar-sub">
            Manage your content pipeline — from brainstorm to published.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "right" }}>
            {batchProgress && (
              <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600 }}>
                {batchProgress}
              </div>
            )}
          </div>
          <button
            className="btn btn-secondary"
            onClick={handleGenerateAll}
            disabled={isBatching || rateLimited}
            title={rateLimited ? "Rate limited — wait 60s" : "Generate all Pending topics sequentially"}
          >
            <Icon d={icons.spark} size={14} />{" "}
            {isBatching ? "Generating All…" : "Generate All"}
          </button>
          <button className="btn btn-primary" onClick={() => setModalOpen(true)} disabled={isBatching}>
            <Icon d={icons.plus} size={14} /> Add New Topic
          </button>
        </div>
      </div>

      <div className="content">
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          {["All", "Pending", "Generating", "Review", "Approved", "Published", "Error"].map((s) => (
            <button key={s} className="btn btn-ghost" style={{ fontSize: 12 }}>
              {s}
              {s !== "All" && (
                <span
                  style={{
                    marginLeft: 4,
                    background: "var(--border)",
                    padding: "1px 6px",
                    borderRadius: 99,
                    fontSize: 10,
                  }}
                >
                  {topics.filter((t) => t.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {selectedIds.size > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
              padding: "8px 12px",
              background: "var(--surface2)",
              borderRadius: 8,
              fontSize: 13,
            }}
          >
            <span style={{ color: "var(--text2)" }}>
              <strong>{selectedIds.size}</strong> selected
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => openRegenerateModal(null)}
              disabled={regenerating || rateLimited}
              title="Regenerate all content for selected topics"
            >
              <Icon d={icons.refresh} size={12} /> Regenerate selected
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: "4px 10px", fontSize: 12, color: "var(--danger, #dc2626)" }}
              onClick={handleMassDelete}
              title="Delete selected topics"
            >
              <Icon d={icons.trash} size={12} /> Delete selected
            </button>
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    ref={selectAllCheckboxRef}
                    checked={topics.length > 0 && selectedIds.size === topics.length}
                    onChange={selectAll}
                    title="Select all"
                  />
                </th>
                <th>Topic Title</th>
                <th>Keyword</th>
                <th>Persona</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggleSelected(t.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    <div>{t.title}</div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: "var(--text3)",
                        marginTop: 2,
                      }}
                    >
                      {t.angle}
                    </div>
                  </td>
                  <td>
                    <code
                      style={{
                        background: "var(--surface2)",
                        padding: "2px 7px",
                        borderRadius: 4,
                        fontSize: 12,
                        color: "var(--accent)",
                      }}
                    >
                      {t.keyword}
                    </code>
                  </td>
                  <td>{t.persona}</td>
                  <td>{statusBadge(t.status)}</td>
                  <td>
                    <div className="actions">
                      {(t.status === "Pending" || t.status === "Generating" || t.status === "Error") && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: "5px 10px", fontSize: 12 }}
                          onClick={() => handleGenerate(t.id)}
                          disabled={rateLimited || isBatching}
                        >
                          <Icon d={icons.spark} size={13} />
                          {rateLimited ? "Rate limited — wait 60s" : "Generate"}
                        </button>
                      )}
                      {t.status === "Review" && (
                        <>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "5px 10px", fontSize: 12 }}
                            onClick={() => openRegenerateModal(t.id)}
                            disabled={rateLimited || regenerating}
                            title="Regenerate all content for this topic"
                          >
                            <Icon d={icons.refresh} size={13} /> Regenerate
                          </button>
                          <a
                            href="/review"
                            className="btn btn-secondary"
                            style={{ padding: "5px 10px", fontSize: 12, textDecoration: "none", color: "inherit" }}
                          >
                            Review →
                          </a>
                        </>
                      )}
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "5px 8px" }}
                        onClick={() => handleDelete(t.id)}
                      >
                        <Icon d={icons.trash} size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add New Topic">
        <div className="form-group" style={{ marginBottom: 20 }}>
          <label className="form-label">Upload TXT or HTML file</label>
          <p style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>
            Each line starting with &quot;Topic title: ...&quot; starts a new topic. Add as many as you need (e.g. 30–40). Other lines: Primary Keyword, Topic tag, Target persona, Intent-arc, Content angle.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.html,.htm"
            onChange={handleFileUpload}
            disabled={uploading}
            style={{ fontSize: 13 }}
          />
          {uploading && <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text3)" }}>Adding topics…</span>}
        </div>
        <div className="section-divider" style={{ margin: "16px 0" }} />
        <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>Or enter manually:</div>
        <div className="form-group">
          <label className="form-label">Topic Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="e.g. How AI is Reshaping B2B Sales in 2025"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Primary Keyword</label>
          <input
            type="text"
            value={form.keyword}
            onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
            placeholder="e.g. ai b2b sales tools"
          />
          <span className="form-hint">Primary keyword to optimize for in the blog post.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Topic tag</label>
          <input
            type="text"
            value={form.topic_tag}
            onChange={(e) => setForm((f) => ({ ...f, topic_tag: e.target.value }))}
            placeholder="e.g. revops, sales-ai"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Target Persona</label>
          <input
            type="text"
            value={form.persona}
            onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
            placeholder="e.g. VP of Sales at a 50-200 person B2B SaaS company"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Intent-arc</label>
          <input
            type="text"
            value={form.intent_arc}
            onChange={(e) => setForm((f) => ({ ...f, intent_arc: e.target.value }))}
            placeholder="e.g. Awareness → Consideration → Decision"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Content Angle</label>
          <input
            type="text"
            value={form.angle}
            onChange={(e) => setForm((f) => ({ ...f, angle: e.target.value }))}
            placeholder="e.g. Contrarian take — AI won't replace reps, it'll amplify them"
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleAdd}>
            <Icon d={icons.plus} size={14} /> Add Topic
          </button>
        </div>
      </Modal>

      <RegenerateContextModal
        open={regenerateModalOpen}
        onClose={() => {
          setRegenerateModalOpen(false);
          setRegenerateTopicId(null);
        }}
        onConfirm={handleRegenerateAll}
        title={selectedIds.size > 0 ? `Regenerate ${selectedIds.size} topic(s)` : "Regenerate All Content"}
        description="Provide additional context to guide the regeneration. What would you like to change or improve?"
        placeholder="e.g. Make it more conversational, add a stronger CTA, focus on the technical audience…"
        isLoading={regenerating}
      />
    </div>
  );
}
