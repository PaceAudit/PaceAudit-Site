"use client";

import { useState } from "react";

// ─── ICONS (inline SVG wrappers) ─────────────────────────────────────────────
const Icon = ({ d, size = 16, stroke = "currentColor", fill = "none", strokeWidth = 1.75, className = "" }: { d: string | string[]; size?: number; stroke?: string; fill?: string; strokeWidth?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    {Array.isArray(d) ? d.map((path, i) => <path key={i} d={path} />) : <path d={d} />}
  </svg>
);

const icons = {
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  lightbulb: ["M9 21h6", "M12 3a6 6 0 0 1 6 6c0 2.22-1.2 4.16-3 5.2V17a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-2.8C7.2 13.16 6 11.22 6 9a6 6 0 0 1 6-6z"],
  clipboard: ["M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2", "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"],
  plus: "M12 5v14M5 12h14",
  spark: ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"],
  trash: ["M3 6h18", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6", "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"],
  check: "M20 6L9 17l-5-5",
  calendar: ["M3 4h18v18H3z", "M16 2v4M8 2v4M3 10h18"],
  x: "M18 6L6 18M6 6l12 12",
  logo: ["M12 2L2 7l10 5 10-5-10-5z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"],
  image: ["M21 15l-5-5L5 21", "M3 3h18v18H3z", "M8.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"],
};

// ─── STYLE CONSTANTS ─────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@600;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0a0a0b;
    --surface: #111113;
    --surface2: #18181b;
    --border: #27272a;
    --border2: #3f3f46;
    --text: #fafafa;
    --text2: #a1a1aa;
    --text3: #71717a;
    --accent: #6ee7b7;
    --accent-dim: rgba(110,231,183,0.12);
    --accent-glow: rgba(110,231,183,0.25);
    --danger: #f87171;
    --warning: #fbbf24;
    --blue: #60a5fa;
    --radius: 10px;
    --radius-sm: 6px;
  }

  body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

  .app { display: flex; height: 100vh; overflow: hidden; }

  /* SIDEBAR */
  .sidebar {
    width: 220px; min-width: 220px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    padding: 20px 12px;
    gap: 4px;
  }
  .sidebar-logo {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px 20px;
    font-family: 'Syne', sans-serif; font-weight: 800; font-size: 15px;
    letter-spacing: -0.02em; color: var(--text);
  }
  .sidebar-logo-icon {
    width: 28px; height: 28px; background: var(--accent);
    border-radius: 6px; display: grid; place-items: center;
    color: #000; flex-shrink: 0;
  }
  .sidebar-label {
    font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
    color: var(--text3); text-transform: uppercase;
    padding: 12px 10px 4px;
  }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: var(--radius-sm);
    cursor: pointer; font-size: 13.5px; font-weight: 500;
    color: var(--text2); transition: all 0.15s;
    border: 1px solid transparent;
  }
  .nav-item:hover { background: var(--surface2); color: var(--text); }
  .nav-item.active {
    background: var(--accent-dim); color: var(--accent);
    border-color: var(--accent-glow);
  }
  .nav-item svg { opacity: 0.8; flex-shrink: 0; }

  /* MAIN */
  .main { flex: 1; overflow-y: auto; display: flex; flex-direction: column; }

  /* TOP BAR */
  .topbar {
    position: sticky; top: 0; z-index: 10;
    background: rgba(10,10,11,0.85); backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    padding: 14px 32px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .topbar-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 17px; letter-spacing: -0.02em; }
  .topbar-sub { font-size: 12px; color: var(--text3); margin-top: 1px; }

  /* CONTENT */
  .content { padding: 28px 32px; flex: 1; }

  /* BUTTONS */
  .btn {
    display: inline-flex; align-items: center; gap: 7px;
    font-family: 'DM Sans', sans-serif; font-weight: 500; font-size: 13.5px;
    padding: 8px 14px; border-radius: var(--radius-sm); cursor: pointer;
    border: none; transition: all 0.15s; white-space: nowrap;
  }
  .btn-primary {
    background: var(--accent); color: #000;
    box-shadow: 0 0 20px var(--accent-glow);
  }
  .btn-primary:hover { opacity: 0.88; box-shadow: 0 0 28px var(--accent-glow); }
  .btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border2); }
  .btn-secondary:hover { background: var(--border); }
  .btn-ghost { background: transparent; color: var(--text2); border: 1px solid transparent; }
  .btn-ghost:hover { background: var(--surface2); color: var(--text); }
  .btn-danger { background: rgba(248,113,113,0.12); color: var(--danger); border: 1px solid rgba(248,113,113,0.2); }
  .btn-danger:hover { background: rgba(248,113,113,0.2); }
  .btn-large { padding: 12px 24px; font-size: 15px; font-weight: 600; border-radius: var(--radius); }

  /* FORM ELEMENTS */
  .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 20px; }
  .form-label { font-size: 12.5px; font-weight: 600; color: var(--text2); letter-spacing: 0.02em; }
  .form-hint { font-size: 11.5px; color: var(--text3); margin-top: 2px; }
  input[type="text"], input[type="datetime-local"], textarea, select {
    background: var(--surface2); border: 1px solid var(--border);
    color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 13.5px;
    padding: 9px 12px; border-radius: var(--radius-sm); width: 100%;
    outline: none; transition: border-color 0.15s, box-shadow 0.15s;
    resize: none;
  }
  input:focus, textarea:focus, select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }
  input::placeholder, textarea::placeholder { color: var(--text3); }

  /* CARDS */
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 24px;
  }
  .card-title {
    font-family: 'Syne', sans-serif; font-weight: 700; font-size: 14px;
    letter-spacing: -0.01em; margin-bottom: 4px;
  }
  .card-desc { font-size: 12.5px; color: var(--text3); margin-bottom: 20px; }
  .section-divider { height: 1px; background: var(--border); margin: 28px 0; }

  /* TAGS */
  .badge {
    display: inline-flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 600; padding: 3px 9px;
    border-radius: 99px; letter-spacing: 0.04em; text-transform: uppercase;
  }
  .badge-pending { background: rgba(251,191,36,0.12); color: var(--warning); border: 1px solid rgba(251,191,36,0.2); }
  .badge-generating { background: rgba(96,165,250,0.12); color: var(--blue); border: 1px solid rgba(96,165,250,0.2); }
  .badge-review { background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent-glow); }
  .badge-published { background: rgba(74,222,128,0.1); color: #4ade80; border: 1px solid rgba(74,222,128,0.2); }

  /* TABLE */
  .table-wrap { overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--border); }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  thead tr { background: var(--surface2); border-bottom: 1px solid var(--border); }
  th { padding: 11px 16px; text-align: left; font-weight: 600; font-size: 11.5px; color: var(--text3); letter-spacing: 0.06em; text-transform: uppercase; }
  tbody tr { border-bottom: 1px solid var(--border); transition: background 0.1s; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: var(--surface2); }
  td { padding: 13px 16px; color: var(--text2); vertical-align: middle; }
  td:first-child { color: var(--text); font-weight: 500; }
  .actions { display: flex; gap: 6px; align-items: center; }

  /* VALUE PROP LIST */
  .prop-item {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; background: var(--surface2);
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    margin-bottom: 8px;
  }
  .prop-item input { background: transparent; border: none; box-shadow: none; padding: 0; font-size: 13.5px; }
  .prop-item input:focus { box-shadow: none; border: none; }
  .prop-drag { color: var(--text3); cursor: grab; }

  /* MODAL */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    backdrop-filter: blur(4px); z-index: 100;
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.15s ease;
  }
  .modal {
    background: var(--surface); border: 1px solid var(--border2);
    border-radius: 14px; padding: 28px; width: 480px; max-width: 95vw;
    box-shadow: 0 24px 80px rgba(0,0,0,0.6);
    animation: slideUp 0.2s ease;
  }
  .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .modal-title { font-family: 'Syne', sans-serif; font-weight: 700; font-size: 16px; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

  /* REVIEW PAGE */
  .review-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 900px) { .review-grid { grid-template-columns: 1fr; } }
  .image-placeholder {
    background: var(--surface2); border: 2px dashed var(--border2);
    border-radius: var(--radius); height: 180px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; color: var(--text3); font-size: 13px; margin-bottom: 16px;
    cursor: pointer; transition: all 0.15s;
  }
  .image-placeholder:hover { border-color: var(--accent); color: var(--accent); }
  .social-card { margin-bottom: 12px; }
  .social-label {
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--text3); margin-bottom: 6px;
  }
  .approve-btn-wrap { margin-top: 24px; }
  .approve-btn {
    width: 100%; padding: 16px; font-size: 16px; font-weight: 700;
    font-family: 'Syne', sans-serif; letter-spacing: -0.01em;
    background: var(--accent); color: #000;
    border: none; border-radius: var(--radius); cursor: pointer;
    box-shadow: 0 0 40px var(--accent-glow);
    transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .approve-btn:hover { opacity: 0.9; box-shadow: 0 0 60px var(--accent-glow); transform: translateY(-1px); }

  /* STICKY SAVE */
  .sticky-save {
    position: sticky; bottom: 0; z-index: 5;
    background: rgba(10,10,11,0.9); backdrop-filter: blur(8px);
    border-top: 1px solid var(--border);
    padding: 14px 32px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .sticky-save-hint { font-size: 12px; color: var(--text3); }

  /* COLOR SWATCH */
  .color-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
  .color-swatch {
    width: 28px; height: 28px; border-radius: 6px; border: 2px solid var(--border2);
    cursor: pointer; transition: transform 0.1s;
  }
  .color-swatch:hover { transform: scale(1.15); }

  /* SAVING FLASH */
  .toast {
    position: fixed; bottom: 80px; right: 24px; z-index: 200;
    background: var(--surface); border: 1px solid var(--accent);
    padding: 12px 18px; border-radius: var(--radius);
    font-size: 13px; color: var(--accent); font-weight: 500;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    animation: slideUp 0.2s ease;
  }

  /* TOPIC TITLE */
  .topic-select-row {
    display: flex; gap: 12px; align-items: center; margin-bottom: 24px;
  }
  .topic-select-row select { max-width: 320px; }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
`;

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const initialTopics = [
  { id: 1, title: "Top 10 AI Tools for Startups in 2025", keyword: "ai tools startups", angle: "Curated list with ROI focus", persona: "Startup Founder", status: "Pending" },
  { id: 2, title: "How to Build a Content Moat with AI", keyword: "content moat strategy", angle: "Thought leadership / contrarian", persona: "Content Marketer", status: "Review" },
  { id: 3, title: "The Hidden Costs of Manual Content Creation", keyword: "content creation costs", angle: "Pain-point driven", persona: "Marketing Director", status: "Generating" },
  { id: 4, title: "Why 90% of AI Content Fails (And How to Fix It)", keyword: "ai content quality", angle: "Problem / solution", persona: "Brand Manager", status: "Published" },
  { id: 5, title: "Building a Personal Brand with AI Assistance", keyword: "personal brand ai", angle: "How-to guide", persona: "Solopreneur", status: "Pending" },
];

const mockBlog = `<h1>How to Build a Content Moat with AI</h1>

<p>In the age of generative AI, content is simultaneously easier and harder to produce than ever before. Easier, because the tools now exist to draft 2,000 words in seconds. Harder, because everyone else has access to the same tools — raising the floor <em>and</em> the ceiling simultaneously.</p>

<p>The companies that will win the next decade of content marketing aren't those who publish the most. They're the ones building what I call a <strong>content moat</strong> — a body of proprietary insight, authentic perspective, and compounding SEO equity that AI alone cannot replicate.</p>

<h2>What Is a Content Moat?</h2>
<p>A content moat is the strategic accumulation of owned media assets that get more valuable over time. Think first-hand case studies, original research, branded frameworks, and genuine point-of-view content that competitors can't simply copy-paste.</p>

<h2>The AI Advantage You're Missing</h2>
<p>Most brands use AI as a replacement for writers. The smartest brands use AI as a leverage tool for <em>their own proprietary data and voice</em>. Feed your customer interviews into the model. Train it on your internal frameworks. Use it to scale what only you can say — not to say what anyone can.</p>`;

const mockLinkedIn = [
  "🚀 Most brands are using AI wrong for content.\n\nThey're using it as a ghostwriter for generic takes nobody asked for.\n\nThe smart move? Use AI to scale your proprietary insight.\n\nYour frameworks. Your data. Your voice — just 10x faster.\n\nThat's how you build a content moat in 2025.\n\n#ContentMarketing #AITools #GrowthStrategy",
  "Unpopular opinion: AI content that sounds like everyone else's AI content is worse than no content at all.\n\nYour audience can smell the generic. They've been trained to skip it.\n\nThe unlock is feeding AI with YOUR:\n→ Customer interview transcripts\n→ Internal frameworks\n→ Original research data\n\nAI as amplifier > AI as author.",
  "Content moat vs. content noise.\n\nOne compounds. One disappears.\n\nBuilding a content moat means creating assets so deeply rooted in your proprietary experience that they're impossible to replicate — even with AI.\n\nHere's the 3-part framework we use for every piece we publish 👇",
];

const mockTweets = [
  "Everyone's drowning in AI content.\n\nThe ones winning: using AI to scale their *own* insights, not generic takes.\n\nContent moat > content noise.",
  "AI writing tip nobody talks about:\n\nFeed it your customer call transcripts.\n\nWatch the output quality jump 10x.\n\nYour customers' words are your biggest content asset.",
];

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={onClose}>
            <Icon d={icons.x} size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ msg }: { msg: string }) {
  return <div className="toast">✓ {msg}</div>;
}

// ─── CONFIG PAGE ──────────────────────────────────────────────────────────────
function ConfigPage() {
  const [voice, setVoice] = useState(`Our brand voice is confident, clear, and empathetic — never arrogant. We write like a knowledgeable friend, not a consultant. Avoid jargon, hedge words ("perhaps", "maybe"), and filler phrases. Every sentence should earn its place.\n\nTone: Direct, warm, slightly provocative. We challenge conventional wisdom with data.\nPOV: First-person plural ("we") for brand content. First-person singular for thought leadership.\nTaboo: No passive voice. No buzzwords. No "leverage" or "synergy".`);
  const [props, setProps] = useState([
    { id: 1, text: "10x content output without adding headcount" },
    { id: 2, text: "Brand-consistent AI that sounds like us, not like everyone else" },
    { id: 3, text: "Measurable SEO impact within 90 days" },
    { id: 4, text: "One-click multi-channel publishing (LinkedIn, X, Blog)" },
  ]);
  const [imgStyle, setImgStyle] = useState("Clean, editorial photography aesthetic. Minimal props. Natural light. Muted, desaturated tones.");
  const [primaryHex, setPrimaryHex] = useState("#6ee7b7");
  const [secondaryHex, setSecondaryHex] = useState("#60a5fa");
  const [toast, setToast] = useState(false);

  const showToast = () => { setToast(true); setTimeout(() => setToast(false), 2500); };

  const addProp = () => setProps(p => [...p, { id: Date.now(), text: "" }]);
  const removeProp = (id: number) => setProps(p => p.filter(x => x.id !== id));
  const updateProp = (id: number, text: string) => setProps(p => p.map(x => x.id === id ? { ...x, text } : x));

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="topbar">
        <div>
          <div className="topbar-title">Brand Engineering</div>
          <div className="topbar-sub">Define your content DNA — these rules govern every piece of AI-generated output.</div>
        </div>
      </div>

      <div className="content" style={{ paddingBottom: 80 }}>
        <div className="card">
          <div className="card-title">Brand Voice & Style</div>
          <div className="card-desc">Describe your tone, writing constraints, and stylistic rules. Be specific — examples are better than adjectives.</div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Voice Definition Prompt</label>
            <textarea rows={9} value={voice} onChange={e => setVoice(e.target.value)} placeholder="Describe your brand's tone, writing style, things to avoid..." />
            <span className="form-hint">{voice.length} characters · Used as a system-level constraint in every generation call.</span>
          </div>
        </div>

        <div className="section-divider" />

        <div className="card">
          <div className="card-title">Value Propositions</div>
          <div className="card-desc">Your core differentiators. AI will weave these into blog posts and social copy naturally.</div>
          {props.map((p) => (
            <div className="prop-item" key={p.id}>
              <span className="prop-drag">⠿</span>
              <input
                type="text" value={p.text}
                onChange={e => updateProp(p.id, e.target.value)}
                placeholder="Enter a value proposition..."
              />
              <button className="btn btn-ghost" style={{ padding: "4px 6px", flexShrink: 0 }} onClick={() => removeProp(p.id)}>
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
          <div className="card-desc">Rules passed to the image generation pipeline for AI-generated cover images.</div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Image Style Rules</label>
              <textarea rows={4} value={imgStyle} onChange={e => setImgStyle(e.target.value)} placeholder="e.g. minimalist, editorial, dark backgrounds..." />
            </div>
            <div className="form-group">
              <label className="form-label">Negative Prompts</label>
              <textarea rows={4} placeholder="e.g. no people, no text in image, no stock photo look..." />
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="form-label">Brand Colors</label>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>Primary</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: primaryHex, border: "2px solid var(--border2)" }} />
                  <input type="text" value={primaryHex} onChange={e => setPrimaryHex(e.target.value)} style={{ width: 110 }} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>Secondary</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: secondaryHex, border: "2px solid var(--border2)" }} />
                  <input type="text" value={secondaryHex} onChange={e => setSecondaryHex(e.target.value)} style={{ width: 110 }} />
                </div>
              </div>
            </div>
          </div>
          <div className="color-row">
            {["#6ee7b7","#60a5fa","#f472b6","#fb923c","#a78bfa","#facc15"].map(c => (
              <div key={c} className="color-swatch" style={{ background: c }} onClick={() => setPrimaryHex(c)} title={c} />
            ))}
          </div>
        </div>
      </div>

      <div className="sticky-save">
        <span className="sticky-save-hint">Changes apply to all future generation requests.</span>
        <button className="btn btn-primary" onClick={showToast}>
          <Icon d={icons.check} size={14} /> Save Configuration
        </button>
      </div>

      {toast && <Toast msg="Configuration saved successfully" />}
    </div>
  );
}

// ─── TOPICS PAGE ──────────────────────────────────────────────────────────────
function TopicsPage() {
  const [topics, setTopics] = useState(initialTopics);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: "", keyword: "", angle: "", persona: "" });
  const [generating, setGenerating] = useState<number | null>(null);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { Pending: "badge-pending", Generating: "badge-generating", Review: "badge-review", Published: "badge-published" };
    return <span className={`badge ${map[s]}`}>{s}</span>;
  };

  const handleAdd = () => {
    if (!form.title) return;
    setTopics(t => [...t, { id: Date.now(), ...form, status: "Pending" }]);
    setForm({ title: "", keyword: "", angle: "", persona: "" });
    setModalOpen(false);
  };

  const handleGenerate = (id: number) => {
    setGenerating(id);
    setTimeout(() => {
      setTopics(t => t.map(x => x.id === id ? { ...x, status: "Generating" } : x));
      setGenerating(null);
      setTimeout(() => {
        setTopics(t => t.map(x => x.id === id ? { ...x, status: "Review" } : x));
      }, 2000);
    }, 600);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="topbar">
        <div>
          <div className="topbar-title">Topic Database</div>
          <div className="topbar-sub">Manage your content pipeline — from brainstorm to published.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Icon d={icons.plus} size={14} /> Add New Topic
        </button>
      </div>

      <div className="content">
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {["All", "Pending", "Generating", "Review", "Published"].map(s => (
            <button key={s} className="btn btn-ghost" style={{ fontSize: 12 }}>{s}
              {s !== "All" && <span style={{ marginLeft: 4, background: "var(--border)", padding: "1px 6px", borderRadius: 99, fontSize: 10 }}>
                {topics.filter(t => t.status === s).length}
              </span>}
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
              {topics.map(t => (
                <tr key={t.id}>
                  <td style={{ maxWidth: 280 }}>
                    <div>{t.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 2 }}>{t.angle}</div>
                  </td>
                  <td><code style={{ background: "var(--surface2)", padding: "2px 7px", borderRadius: 4, fontSize: 12, color: "var(--accent)" }}>{t.keyword}</code></td>
                  <td>{t.persona}</td>
                  <td>{statusBadge(t.status)}</td>
                  <td>
                    <div className="actions">
                      {t.status === "Pending" && (
                        <button className="btn btn-primary" style={{ padding: "5px 10px", fontSize: 12 }}
                          onClick={() => handleGenerate(t.id)} disabled={generating === t.id}>
                          <Icon d={icons.spark} size={13} />
                          {generating === t.id ? "Queuing…" : "Generate"}
                        </button>
                      )}
                      {t.status === "Review" && (
                        <button className="btn btn-secondary" style={{ padding: "5px 10px", fontSize: 12 }}>
                          Review →
                        </button>
                      )}
                      <button className="btn btn-ghost" style={{ padding: "5px 8px" }}>
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
          <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="e.g. How AI is Reshaping B2B Sales in 2025" />
        </div>
        <div className="form-group">
          <label className="form-label">Target Keyword</label>
          <input type="text" value={form.keyword} onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
            placeholder="e.g. ai b2b sales tools" />
          <span className="form-hint">Primary keyword to optimize for in the blog post.</span>
        </div>
        <div className="form-group">
          <label className="form-label">Content Angle</label>
          <input type="text" value={form.angle} onChange={e => setForm(f => ({ ...f, angle: e.target.value }))}
            placeholder="e.g. Contrarian take — AI won't replace reps, it'll amplify them" />
        </div>
        <div className="form-group">
          <label className="form-label">Target Persona</label>
          <input type="text" value={form.persona} onChange={e => setForm(f => ({ ...f, persona: e.target.value }))}
            placeholder="e.g. VP of Sales at a 50-200 person B2B SaaS company" />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleAdd}>
            <Icon d={icons.plus} size={14} /> Add Topic
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ─── REVIEW PAGE ──────────────────────────────────────────────────────────────
function ReviewPage() {
  const [blog, setBlog] = useState(mockBlog);
  const [linkedin, setLinkedin] = useState(mockLinkedIn);
  const [tweets, setTweets] = useState(mockTweets);
  const [schedDate, setSchedDate] = useState("2025-02-28T09:00");
  const [toast, setToast] = useState(false);

  const approve = () => { setToast(true); setTimeout(() => setToast(false), 3000); };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <div className="topbar">
        <div>
          <div className="topbar-title">Review & Schedule</div>
          <div className="topbar-sub">Approve and edit content before it goes out. Everything here is ready for final review.</div>
        </div>
        <div className="topic-select-row" style={{ margin: 0 }}>
          <select style={{ width: 280 }}>
            <option>How to Build a Content Moat with AI</option>
            <option>Top 10 AI Tools for Startups in 2025</option>
          </select>
        </div>
      </div>

      <div className="content">
        <div className="review-grid">
          <div>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text3)" }}>Blog Post Draft</span>
            </div>
            <div className="image-placeholder">
              <Icon d={icons.image} size={28} />
              <span>AI Cover Image</span>
              <span style={{ fontSize: 11 }}>Click to regenerate</span>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">HTML Content</label>
              <textarea rows={22} value={blog} onChange={e => setBlog(e.target.value)}
                style={{ fontFamily: "monospace", fontSize: 12.5, lineHeight: 1.6 }} />
              <span className="form-hint">{blog.split(" ").length} words · Editing directly modifies the generation output.</span>
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text3)" }}>Social Variations</span>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>LinkedIn</span>
                3 variations
              </div>
              {linkedin.map((l, i) => (
                <div key={i} className="social-card">
                  <div className="social-label">Variation {i + 1}</div>
                  <textarea rows={5} value={l} onChange={e => setLinkedin(prev => prev.map((x, j) => j === i ? e.target.value : x))} />
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text2)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>𝕏 / Twitter</span>
                2 variations
              </div>
              {tweets.map((tw, i) => (
                <div key={i} className="social-card">
                  <div className="social-label" style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Post {i + 1}</span>
                    <span style={{ color: tw.length > 260 ? "var(--danger)" : "var(--text3)" }}>{tw.length}/280</span>
                  </div>
                  <textarea rows={3} value={tw} onChange={e => setTweets(prev => prev.map((x, j) => j === i ? e.target.value : x))} />
                </div>
              ))}
            </div>

            <div className="card" style={{ marginTop: 20, padding: 16 }}>
              <div className="card-title" style={{ marginBottom: 12 }}>Publish Settings</div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Scheduled Date & Time</label>
                <input type="datetime-local" value={schedDate} onChange={e => setSchedDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Publish To</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["Blog / CMS", "LinkedIn", "X / Twitter", "Newsletter"].map(ch => (
                    <label key={ch} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text2)", cursor: "pointer" }}>
                      <input type="checkbox" defaultChecked style={{ accentColor: "var(--accent)" }} /> {ch}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="approve-btn-wrap">
              <button className="approve-btn" onClick={approve}>
                <Icon d={icons.check} size={18} /> Approve & Schedule
              </button>
              <div style={{ textAlign: "center", fontSize: 11.5, color: "var(--text3)", marginTop: 10 }}>
                Scheduled for {new Date(schedDate).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast msg="Content approved and scheduled!" />}
    </div>
  );
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState("topics");

  const navItems = [
    { id: "config", label: "Brand Config", icon: icons.settings },
    { id: "topics", label: "Topic Database", icon: icons.lightbulb },
    { id: "review", label: "Review Queue", icon: icons.clipboard },
  ];

  const renderPage = () => {
    if (page === "config") return <ConfigPage />;
    if (page === "topics") return <TopicsPage />;
    if (page === "review") return <ReviewPage />;
  };

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">
              <Icon d={icons.spark} size={14} fill="currentColor" stroke="none" />
            </div>
            SPH AI
          </div>

          <div className="sidebar-label">Navigation</div>
          {navItems.map(n => (
            <div key={n.id} className={`nav-item${page === n.id ? " active" : ""}`} onClick={() => setPage(n.id)}>
              <Icon d={n.icon} size={15} />
              {n.label}
            </div>
          ))}

          <div style={{ flex: 1 }} />
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 8 }}>
            <div style={{ fontSize: 11.5, color: "var(--text3)", padding: "0 10px" }}>
              <div style={{ fontWeight: 600, color: "var(--text2)", marginBottom: 2 }}>SPH AI</div>
              <div>Powered by Gemini</div>
              <div style={{ marginTop: 6 }}>
                <span style={{ background: "var(--accent-dim)", color: "var(--accent)", fontSize: 10, padding: "2px 7px", borderRadius: 99, border: "1px solid var(--accent-glow)" }}>● Local</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="main">
          {renderPage()}
        </main>
      </div>
    </>
  );
}
