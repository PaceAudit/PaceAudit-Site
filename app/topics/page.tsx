"use client";

import { useState, useEffect } from "react";
import { Icon, icons } from "@/components/Icon";
import { Modal } from "@/components/Modal";

type Topic = {
  id: number;
  title: string;
  keyword: string;
  angle: string;
  persona: string;
  status: string;
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    Pending: "badge-pending",
    Generating: "badge-generating",
    Review: "badge-review",
    Published: "badge-published",
  };
  return <span className={`badge ${map[s]}`}>{s}</span>;
}

export default function TopicsPage() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    keyword: "",
    angle: "",
    persona: "",
  });
  const [generating, setGenerating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTopics = () => {
    fetch("/api/topics")
      .then((res) => res.json())
      .then((data) => setTopics(Array.isArray(data) ? data : []))
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTopics();
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
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.id != null) {
          setTopics((t) => [{ ...data, keyword: data.keyword ?? "", angle: data.angle ?? "", persona: data.persona ?? "" }, ...t]);
          setForm({ title: "", keyword: "", angle: "", persona: "" });
          setModalOpen(false);
        }
      })
      .catch(() => {});
  };

  const handleGenerate = (id: number) => {
    setGenerating(id);
    fetch(`/api/topics/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "Generating" }),
    }).then((res) => res.ok && setTopics((t) => t.map((x) => (x.id === id ? { ...x, status: "Generating" } : x))));

    fetch(`/api/generate?topicId=${id}`, { method: "POST" })
      .then((res) => {
        const ok = res.ok;
        return res.json().then((data) => ({ ok, error: data?.error }));
      })
      .then(({ ok, error }) => {
        if (ok) {
          setTopics((t) => t.map((x) => (x.id === id ? { ...x, status: "Review" } : x)));
        } else if (error) {
          alert(error);
        }
      })
      .catch(() => alert("Generation failed"))
      .finally(() => setGenerating(null));
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this topic?")) return;
    fetch(`/api/topics/${id}`, { method: "DELETE" })
      .then((res) => res.ok && setTopics((t) => t.filter((x) => x.id !== id)))
      .catch(() => {});
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
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Icon d={icons.plus} size={14} /> Add New Topic
        </button>
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
          {["All", "Pending", "Generating", "Review", "Published"].map((s) => (
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

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
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
                      {t.status === "Pending" && (
                        <button
                          className="btn btn-primary"
                          style={{ padding: "5px 10px", fontSize: 12 }}
                          onClick={() => handleGenerate(t.id)}
                          disabled={generating === t.id}
                        >
                          <Icon d={icons.spark} size={13} />
                          {generating === t.id ? "Queuing…" : "Generate"}
                        </button>
                      )}
                      {t.status === "Review" && (
                        <a
                          href="/review"
                          className="btn btn-secondary"
                          style={{ padding: "5px 10px", fontSize: 12, textDecoration: "none", color: "inherit" }}
                        >
                          Review →
                        </a>
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
          <label className="form-label">Target Keyword</label>
          <input
            type="text"
            value={form.keyword}
            onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))}
            placeholder="e.g. ai b2b sales tools"
          />
          <span className="form-hint">
            Primary keyword to optimize for in the blog post.
          </span>
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
        <div className="form-group">
          <label className="form-label">Target Persona</label>
          <input
            type="text"
            value={form.persona}
            onChange={(e) => setForm((f) => ({ ...f, persona: e.target.value }))}
            placeholder="e.g. VP of Sales at a 50-200 person B2B SaaS company"
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
    </div>
  );
}
