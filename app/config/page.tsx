"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon, icons } from "@/components/Icon";
import { Toast } from "@/components/Toast";

const defaultVoice = `Our brand voice is confident, clear, and empathetic — never arrogant. We write like a knowledgeable friend, not a consultant. Avoid jargon, hedge words ("perhaps", "maybe"), and filler phrases. Every sentence should earn its place.\n\nTone: Direct, warm, slightly provocative. We challenge conventional wisdom with data.\nPOV: First-person plural ("we") for brand content. First-person singular for thought leadership.\nTaboo: No passive voice. No buzzwords. No "leverage" or "synergy".`;

const defaultProps = [
  { id: 1, text: "10x content output without adding headcount" },
  { id: 2, text: "Brand-consistent AI that sounds like us, not like everyone else" },
  { id: 3, text: "Measurable SEO impact within 90 days" },
  { id: 4, text: "One-click multi-channel publishing (LinkedIn, X, Blog)" },
];

function ConfigContent() {
  const [voice, setVoice] = useState(defaultVoice);
  const [props, setProps] = useState<{ id: number; text: string }[]>(defaultProps);
  const [imgStyle, setImgStyle] = useState(
    "Clean, editorial photography aesthetic. Minimal props. Natural light. Muted, desaturated tones."
  );
  const [primaryHex, setPrimaryHex] = useState("#6ee7b7");
  const [secondaryHex, setSecondaryHex] = useState("#60a5fa");
  const [toast, setToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [loading, setLoading] = useState(true);
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
          setVoice(data.brand_voice || defaultVoice);
          const arr = Array.isArray(data.value_props) ? data.value_props : [];
          setProps(
            arr.length
              ? arr.map((text: string, i: number) => ({ id: i + 1, text }))
              : defaultProps
          );
          setImgStyle(data.image_style ?? "");
          setPrimaryHex(data.primary_hex ?? "#6ee7b7");
          setSecondaryHex(data.secondary_hex ?? "#60a5fa");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        value_props: props.map((p) => p.text),
        image_style: imgStyle,
        primary_hex: primaryHex,
        secondary_hex: secondaryHex,
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
          <div className="card-title">Brand Voice & Style</div>
          <div className="card-desc">
            Describe your tone, writing constraints, and stylistic rules. Be specific — examples are
            better than adjectives.
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Voice Definition Prompt</label>
            <textarea
              rows={9}
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              placeholder="Describe your brand's tone, writing style, things to avoid..."
            />
            <span className="form-hint">
              {voice.length} characters · Used as a system-level constraint in every generation call.
            </span>
          </div>
        </div>

        <div className="section-divider" />

        <div className="card">
          <div className="card-title">Value Propositions</div>
          <div className="card-desc">
            Your core differentiators. AI will weave these into blog posts and social copy naturally.
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

        <div className="section-divider" />

        <div className="card">
          <div className="card-title">Visual Identity</div>
          <div className="card-desc">
            Rules passed to the image generation pipeline for AI-generated cover images.
          </div>
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
                placeholder="e.g. no people, no text in image, no stock photo look..."
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
