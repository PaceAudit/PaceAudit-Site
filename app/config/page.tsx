"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon, icons } from "@/components/Icon";
import { Toast } from "@/components/Toast";

const defaultBlogVoice = `Our brand voice is confident, clear, and empathetic — never arrogant. We write like a knowledgeable friend, not a consultant. Avoid jargon, hedge words ("perhaps", "maybe"), and filler phrases. Every sentence should earn its place.\n\nTone: Direct, warm, slightly provocative. We challenge conventional wisdom with data.\nPOV: First-person plural ("we") for brand content. First-person singular for thought leadership.\nTaboo: No passive voice. No buzzwords. No "leverage" or "synergy".`;

const defaultPlatformVoice = "Professional, concise. Match platform norms. No jargon.";

const defaultBlogVisualPrompts = [
  "Editorial photography. Clean composition. Natural light. Muted tones. Minimal props.",
  "Abstract, conceptual. Bold shapes. High contrast. Modern, tech-forward aesthetic.",
  "Documentary style. Authentic, candid feel. Warm color palette. Human-centered.",
  "Luxury, premium. Soft shadows. Refined details. Sophisticated, aspirational.",
  "Bright, optimistic. Pastel accents. Fresh, contemporary. Lifestyle-oriented.",
];

const defaultLinkedinVisualPrompts = [
  "Professional, polished. B2B aesthetic. Clear focal point. Editorial feel.",
  "Thought leadership. Abstract, conceptual. Modern, authoritative.",
  "Warm, approachable. Human-centered. Authentic, credible.",
];

const defaultTwitterVisualPrompts = [
  "Bold, punchy. High contrast. Meme-friendly. Quick-read composition.",
  "Casual, conversational. Lifestyle context. Relatable, shareable.",
  "High-impact. Strong visual hook. Designed for feed scroll stop.",
];

const defaultInstagramVisualPrompts = [
  "Aesthetic, curated. Square-friendly. Lifestyle, aspirational.",
  "Bright, optimistic. Pastel or vibrant. On-brand, cohesive.",
  "Authentic, candid. Behind-the-scenes feel. Human, real.",
];

const defaultProps = [
  { id: 1, text: "10x content output without adding headcount" },
  { id: 2, text: "Brand-consistent AI that sounds like us, not like everyone else" },
  { id: 3, text: "Measurable SEO impact within 90 days" },
  { id: 4, text: "One-click multi-channel publishing (LinkedIn, X, Blog)" },
];

type PersonaTab = "blog" | "linkedin" | "instagram" | "x";

function ConfigContent() {
  const [personaTab, setPersonaTab] = useState<PersonaTab>("blog");
  const [voice, setVoice] = useState(defaultBlogVoice);
  const [linkedinPersona, setLinkedinPersona] = useState(defaultPlatformVoice);
  const [instagramPersona, setInstagramPersona] = useState(defaultPlatformVoice);
  const [twitterPersona, setTwitterPersona] = useState(defaultPlatformVoice);
  const [props, setProps] = useState<{ id: number; text: string }[]>(defaultProps);
  const [imgStyle, setImgStyle] = useState(
    "Clean, editorial photography aesthetic. Minimal props. Natural light. Muted, desaturated tones."
  );
  const [negativePrompts, setNegativePrompts] = useState("");
  const [visualTab, setVisualTab] = useState<"blog" | "linkedin" | "twitter" | "instagram">("blog");
  const [blogVisualPrompts, setBlogVisualPrompts] = useState<string[]>(defaultBlogVisualPrompts);
  const [linkedinVisualPrompts, setLinkedinVisualPrompts] = useState<string[]>(defaultLinkedinVisualPrompts);
  const [twitterVisualPrompts, setTwitterVisualPrompts] = useState<string[]>(defaultTwitterVisualPrompts);
  const [instagramVisualPrompts, setInstagramVisualPrompts] = useState<string[]>(defaultInstagramVisualPrompts);
  const [primaryHex, setPrimaryHex] = useState("#6ee7b7");
  const [secondaryHex, setSecondaryHex] = useState("#60a5fa");
  const [toast, setToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [mediaList, setMediaList] = useState<{ id: string; filename: string; description: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadDesc, setUploadDesc] = useState("");
  const searchParams = useSearchParams();

  useEffect(() => {
    const connected = searchParams.get("linkedin_connected");
    const err = searchParams.get("linkedin_error");
    if (connected) {
      setToastMsg("LinkedIn connected successfully.");
      setToast(true);
      setTimeout(() => setToast(false), 2500);
    }
    if (err) {
      setToastMsg(`LinkedIn error: ${decodeURIComponent(err)}`);
      setToast(true);
      setTimeout(() => setToast(false), 5000);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.brand_voice !== undefined) {
          setVoice(data.brand_voice || defaultBlogVoice);
          setLinkedinPersona(data.linkedin_persona ?? defaultPlatformVoice);
          setInstagramPersona(data.instagram_persona ?? defaultPlatformVoice);
          setTwitterPersona(data.twitter_persona ?? defaultPlatformVoice);
          const arr = Array.isArray(data.value_props) ? data.value_props : [];
          setProps(
            arr.length
              ? arr.map((text: string, i: number) => ({ id: i + 1, text }))
              : defaultProps
          );
          setImgStyle(data.image_style ?? "");
          setNegativePrompts(data.image_negative_prompts ?? "");
          const bv = Array.isArray(data.blog_visual_prompts) ? data.blog_visual_prompts : defaultBlogVisualPrompts;
          const liv = Array.isArray(data.linkedin_visual_prompts) ? data.linkedin_visual_prompts : defaultLinkedinVisualPrompts;
          const twv = Array.isArray(data.twitter_visual_prompts) ? data.twitter_visual_prompts : defaultTwitterVisualPrompts;
          const igv = Array.isArray(data.instagram_visual_prompts) ? data.instagram_visual_prompts : defaultInstagramVisualPrompts;
          setBlogVisualPrompts(bv.length >= 5 ? bv : [...bv, ...defaultBlogVisualPrompts.slice(bv.length)].slice(0, 5));
          setLinkedinVisualPrompts(liv.length >= 3 ? liv : [...liv, ...defaultLinkedinVisualPrompts.slice(liv.length)].slice(0, 3));
          setTwitterVisualPrompts(twv.length >= 3 ? twv : [...twv, ...defaultTwitterVisualPrompts.slice(twv.length)].slice(0, 3));
          setInstagramVisualPrompts(igv.length >= 3 ? igv : [...igv, ...defaultInstagramVisualPrompts.slice(igv.length)].slice(0, 3));
          setPrimaryHex(data.primary_hex ?? "#6ee7b7");
          setSecondaryHex(data.secondary_hex ?? "#60a5fa");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/media")
      .then((res) => res.json())
      .then((list) => setMediaList(Array.isArray(list) ? list : []))
      .catch(() => setMediaList([]));
  }, []);

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("description", uploadDesc);
    fetch("/api/media", { method: "POST", body: form })
      .then((res) => res.json())
      .then((item) => {
        if (item.id) setMediaList((prev) => [...prev, item]);
        setUploadDesc("");
        setToastMsg("Image added to content library.");
        setToast(true);
        setTimeout(() => setToast(false), 2500);
      })
      .catch(() => {
        setToastMsg("Upload failed.");
        setToast(true);
        setTimeout(() => setToast(false), 3000);
      })
      .finally(() => {
        setUploading(false);
        e.target.value = "";
      });
  };

  const handleMediaDelete = (id: string) => {
    fetch(`/api/media/${id}`, { method: "DELETE" })
      .then((res) => {
        if (res.ok) setMediaList((prev) => prev.filter((m) => m.id !== id));
      })
      .catch(() => {});
  };

  const showToast = (msg = "Configuration saved successfully") => {
    setToastMsg(msg);
    setToast(true);
    setTimeout(() => setToast(false), 2500);
  };

  const saveConfig = () => {
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_voice: voice,
        linkedin_persona: linkedinPersona,
        instagram_persona: instagramPersona,
        twitter_persona: twitterPersona,
        value_props: props.map((p) => p.text),
        image_style: imgStyle,
        image_negative_prompts: negativePrompts,
        primary_hex: primaryHex,
        secondary_hex: secondaryHex,
        blog_visual_prompts: blogVisualPrompts.slice(0, 5),
        linkedin_visual_prompts: linkedinVisualPrompts.slice(0, 3),
        twitter_visual_prompts: twitterVisualPrompts.slice(0, 3),
        instagram_visual_prompts: instagramVisualPrompts.slice(0, 3),
      }),
    })
      .then((res) => {
        if (res.ok) showToast("Configuration saved successfully");
      })
      .catch(() => {});
  };

  const addProp = () => setProps((p) => [...p, { id: Date.now(), text: "" }]);
  const removeProp = (id: number) => setProps((p) => p.filter((x) => x.id !== id));
  const updateProp = (id: number, text: string) =>
    setProps((p) => p.map((x) => (x.id === id ? { ...x, text } : x)));

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
          <div className="topbar-title">Brand Engineering</div>
          <div className="topbar-sub">
            Define your content DNA — these rules govern every piece of AI-generated output.
          </div>
        </div>
        <Link
          href="/api/auth/linkedin"
          className="btn btn-primary"
          style={{ display: "inline-flex", textDecoration: "none" }}
        >
          <Icon d={icons.link} size={14} /> Connect LinkedIn
        </Link>
      </div>

      <div className="content" style={{ paddingBottom: 80 }}>
        <div className="card">
          <div className="card-title">Persona / Voice by platform</div>
          <div className="card-desc">
            Set a distinct voice for each channel. Value propositions live only on the Blog tab and are inherited as context by all channels.
          </div>
          <div style={{ display: "flex", gap: 2, marginBottom: 16, flexWrap: "wrap" }}>
            {(
              [
                { id: "blog" as const, label: "Blog" },
                { id: "linkedin" as const, label: "LinkedIn" },
                { id: "instagram" as const, label: "Instagram" },
                { id: "x" as const, label: "X (Twitter)" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setPersonaTab(id)}
                style={{
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: personaTab === id ? "var(--accent)" : "var(--text2)",
                  background: personaTab === id ? "var(--accent-dim)" : "var(--surface2)",
                  border: `1px solid ${personaTab === id ? "var(--accent-glow)" : "var(--border)"}`,
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {personaTab === "blog" && (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Blog persona / voice</label>
                <textarea
                  rows={6}
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  placeholder="Describe your brand's tone and style for long-form content..."
                  style={{ width: "100%" }}
                />
                <span className="form-hint">
                  {voice.length} characters · Used for blog and as source of intent for tandem generation.
                </span>
              </div>
              <div style={{ marginTop: 16 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>Value propositions (Blog only — inherited by all channels)</div>
                <div className="card-desc" style={{ marginBottom: 8 }}>
                  Your core differentiators. AI weaves these into the blog and uses them as context for social; only this tab has value props.
                </div>
                {props.map((p) => (
                  <div className="prop-item" key={p.id}>
                    <span className="prop-drag">⠿</span>
                    <input
                      type="text"
                      value={p.text}
                      onChange={(e) => updateProp(p.id, e.target.value)}
                      placeholder="Enter a value proposition..."
                    />
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "4px 6px", flexShrink: 0 }}
                      onClick={() => removeProp(p.id)}
                    >
                      <Icon d={icons.trash} size={14} />
                    </button>
                  </div>
                ))}
                <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={addProp}>
                  <Icon d={icons.plus} size={14} /> Add Value Prop
                </button>
              </div>
            </>
          )}

          {personaTab === "linkedin" && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">LinkedIn persona / voice</label>
              <textarea
                rows={6}
                value={linkedinPersona}
                onChange={(e) => setLinkedinPersona(e.target.value)}
                placeholder="Tone and style for LinkedIn posts. Context from Blog value props is applied automatically."
                style={{ width: "100%" }}
              />
            </div>
          )}

          {personaTab === "instagram" && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Instagram persona / voice</label>
              <textarea
                rows={6}
                value={instagramPersona}
                onChange={(e) => setInstagramPersona(e.target.value)}
                placeholder="Tone and style for Instagram. Context from Blog value props is applied automatically."
                style={{ width: "100%" }}
              />
            </div>
          )}

          {personaTab === "x" && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">X (Twitter) persona / voice</label>
              <textarea
                rows={6}
                value={twitterPersona}
                onChange={(e) => setTwitterPersona(e.target.value)}
                placeholder="Tone and style for X/Twitter. Context from Blog value props is applied automatically."
                style={{ width: "100%" }}
              />
            </div>
          )}
        </div>

        <div className="section-divider" />

        <div className="card">
          <div className="card-title">Visual Identity Prompts</div>
          <div className="card-desc">
            Prompts cycle through these on each generation so images stay varied. Context (blog topic or post text) is combined with the selected prompt to keep each image unique.
          </div>
          <div style={{ display: "flex", gap: 2, marginBottom: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setVisualTab("blog")}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: visualTab === "blog" ? "var(--accent)" : "var(--text2)",
                background: visualTab === "blog" ? "var(--accent-dim)" : "var(--surface2)",
                border: `1px solid ${visualTab === "blog" ? "var(--accent-glow)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              Blog (5 prompts)
            </button>
            <button
              type="button"
              onClick={() => setVisualTab("linkedin")}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: visualTab === "linkedin" ? "var(--accent)" : "var(--text2)",
                background: visualTab === "linkedin" ? "var(--accent-dim)" : "var(--surface2)",
                border: `1px solid ${visualTab === "linkedin" ? "var(--accent-glow)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              LinkedIn (3)
            </button>
            <button
              type="button"
              onClick={() => setVisualTab("twitter")}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: visualTab === "twitter" ? "var(--accent)" : "var(--text2)",
                background: visualTab === "twitter" ? "var(--accent-dim)" : "var(--surface2)",
                border: `1px solid ${visualTab === "twitter" ? "var(--accent-glow)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              X (3)
            </button>
            <button
              type="button"
              onClick={() => setVisualTab("instagram")}
              style={{
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                color: visualTab === "instagram" ? "var(--accent)" : "var(--text2)",
                background: visualTab === "instagram" ? "var(--accent-dim)" : "var(--surface2)",
                border: `1px solid ${visualTab === "instagram" ? "var(--accent-glow)" : "var(--border)"}`,
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              Instagram (3)
            </button>
          </div>

          {visualTab === "blog" && (
            <div style={{ marginBottom: 24 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>Blog cover image prompts (cycle 1 → 5)</div>
              <div className="card-desc" style={{ marginBottom: 12 }}>Each generation uses the next prompt in sequence. Context: blog topic.</div>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Prompt {i + 1}</label>
                  <input
                    type="text"
                    value={blogVisualPrompts[i] ?? ""}
                    onChange={(e) => {
                      const next = [...blogVisualPrompts];
                      while (next.length <= i) next.push("");
                      next[i] = e.target.value;
                      setBlogVisualPrompts(next.slice(0, 5));
                    }}
                    placeholder="e.g. Editorial photography. Clean composition..."
                    style={{ width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                  />
                </div>
              ))}
            </div>
          )}

          {visualTab === "linkedin" && (
            <div style={{ marginBottom: 24 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>LinkedIn image prompts (cycle 1 → 3)</div>
              <div className="card-desc" style={{ marginBottom: 12 }}>Each generation uses the next prompt. Context: post text.</div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Prompt {i + 1}</label>
                  <input
                    type="text"
                    value={linkedinVisualPrompts[i] ?? ""}
                    onChange={(e) => {
                      const next = [...linkedinVisualPrompts];
                      while (next.length <= i) next.push("");
                      next[i] = e.target.value;
                      setLinkedinVisualPrompts(next.slice(0, 3));
                    }}
                    placeholder="e.g. Professional, polished. B2B aesthetic..."
                    style={{ width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                  />
                </div>
              ))}
            </div>
          )}

          {visualTab === "twitter" && (
            <div style={{ marginBottom: 24 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>X (Twitter) image prompts (cycle 1 → 3)</div>
              <div className="card-desc" style={{ marginBottom: 12 }}>Each generation uses the next prompt. Context: post text.</div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Prompt {i + 1}</label>
                  <input
                    type="text"
                    value={twitterVisualPrompts[i] ?? ""}
                    onChange={(e) => {
                      const next = [...twitterVisualPrompts];
                      while (next.length <= i) next.push("");
                      next[i] = e.target.value;
                      setTwitterVisualPrompts(next.slice(0, 3));
                    }}
                    placeholder="e.g. Bold, punchy. High contrast..."
                    style={{ width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                  />
                </div>
              ))}
            </div>
          )}

          {visualTab === "instagram" && (
            <div style={{ marginBottom: 24 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>Instagram image prompts (cycle 1 → 3)</div>
              <div className="card-desc" style={{ marginBottom: 12 }}>Each generation uses the next prompt. Context: caption text.</div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Prompt {i + 1}</label>
                  <input
                    type="text"
                    value={instagramVisualPrompts[i] ?? ""}
                    onChange={(e) => {
                      const next = [...instagramVisualPrompts];
                      while (next.length <= i) next.push("");
                      next[i] = e.target.value;
                      setInstagramVisualPrompts(next.slice(0, 3));
                    }}
                    placeholder="e.g. Aesthetic, curated. Square-friendly..."
                    style={{ width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="card-title" style={{ marginTop: 24, marginBottom: 8 }}>Image Style & Negative Prompts</div>
          <div className="card-desc" style={{ marginBottom: 12 }}>Applied globally to all image generations.</div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Image Style Rules</label>
              <textarea
                rows={4}
                value={imgStyle}
                onChange={(e) => setImgStyle(e.target.value)}
                placeholder="e.g. minimalist, editorial, dark backgrounds..."
              />
            </div>
            <div className="form-group">
              <label className="form-label">Negative Prompts</label>
              <textarea
                rows={4}
                value={negativePrompts}
                onChange={(e) => setNegativePrompts(e.target.value)}
                placeholder="e.g. no people, no text in image, no stock photo look..."
                style={{ width: "100%" }}
              />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label">Brand Colors</label>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>Primary</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      background: primaryHex,
                      border: "2px solid var(--border2)",
                    }}
                  />
                  <input
                    type="text"
                    value={primaryHex}
                    onChange={(e) => setPrimaryHex(e.target.value)}
                    style={{ width: 110 }}
                  />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>Secondary</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      background: secondaryHex,
                      border: "2px solid var(--border2)",
                    }}
                  />
                  <input
                    type="text"
                    value={secondaryHex}
                    onChange={(e) => setSecondaryHex(e.target.value)}
                    style={{ width: 110 }}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="color-row">
            {["#6ee7b7", "#60a5fa", "#f472b6", "#fb923c", "#a78bfa", "#facc15"].map((c) => (
              <div
                key={c}
                className="color-swatch"
                style={{ background: c }}
                onClick={() => setPrimaryHex(c)}
                title={c}
              />
            ))}
          </div>
        </div>

        <div className="section-divider" />

        <div className="card">
          <div className="card-title">Content image library</div>
          <div className="card-desc">
            Upload images to reuse in generated content (e.g. CRM in motion, product shots). The AI may use these when relevant — for example, suggesting an image with text overlay.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Description (for AI context)</label>
              <input
                type="text"
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                placeholder="e.g. CRM dashboard in motion"
                style={{ width: 260 }}
              />
            </div>
            <label className="btn btn-secondary" style={{ marginBottom: 0, cursor: "pointer" }}>
              {uploading ? "Uploading…" : "Choose image"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={handleMediaUpload}
                disabled={uploading}
              />
            </label>
          </div>
          {mediaList.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              {mediaList.map((m) => (
                <div
                  key={m.id}
                  style={{
                    width: 140,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    overflow: "hidden",
                    background: "var(--surface2)",
                  }}
                >
                  <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ display: "block", height: 100, background: "var(--border2)" }}>
                    <img src={m.url} alt={m.description || m.filename} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </a>
                  <div style={{ padding: 8, fontSize: 11, color: "var(--text2)", minHeight: 36 }}>
                    {m.description || m.filename}
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: "100%", fontSize: 11, padding: "4px 8px" }}
                    onClick={() => handleMediaDelete(m.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "var(--text3)" }}>No images yet. Add one to reuse in content.</div>
          )}
        </div>
      </div>

      <div className="sticky-save">
        <span className="sticky-save-hint">Changes apply to all future generation requests.</span>
        <button className="btn btn-primary" onClick={saveConfig}>
          <Icon d={icons.check} size={14} /> Save Configuration
        </button>
      </div>

      {toast && <Toast msg={toastMsg} />}
    </div>
  );
}

export default function ConfigPage() {
  return (
    <Suspense fallback={<div>Loading settings...</div>}>
      <ConfigContent />
    </Suspense>
  );
}
