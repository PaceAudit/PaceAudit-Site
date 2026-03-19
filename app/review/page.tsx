"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Icon, icons } from "@/components/Icon";
import { Toast } from "@/components/Toast";
import { RegenerateContextModal } from "@/components/RegenerateContextModal";

const LINKEDIN_COUNT = 3;
const TWITTER_COUNT = 6;
const INSTAGRAM_COUNT = 3;
const MAX_TABS = 50;

type Topic = { id: number; title: string; keyword: string; angle: string; persona: string; status: string };

type SocialPost = {
  text: string;
  datetime: string; // datetime-local value
  imageUrl?: string;
  excluded?: boolean; // user cancelled — don't include in post
};

type Slot = {
  id: string;
  blogDate: string; // YYYY-MM-DD for tab label
  topicId: number | null;
  topicTitle: string;
  blogHtml: string;
  metaDescription: string;
  seoTags: string;
  coverImageUrl: string | null;
  blogExcluded?: boolean; // user cancelled blog from posting
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

function defaultBlogScheduledDate(blogDateStr: string | null | undefined): string | null {
  if (!blogDateStr) return null;
  return `${blogDateStr}T09:00:00`;
}

/** Each tab = 3-day cycle. Day 1: blog + 1 LI + 1 IG + 2 tweets; days 2–3: social only. */
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
    metaDescription: "",
    seoTags: "",
    coverImageUrl: null,
    linkedin: Array.from({ length: LINKEDIN_COUNT }, (_, i) => ({
      text: "",
      datetime: defaultDatetime(blogDateOffset + i, 12),
      imageUrl: undefined,
    })),
    twitter: Array.from({ length: TWITTER_COUNT }, (_, i) => ({
      text: "",
      datetime: defaultDatetime(blogDateOffset + Math.floor(i / 2), i % 2 === 0 ? 9 : 17),
    })),
    instagram: Array.from({ length: INSTAGRAM_COUNT }, (_, i) => ({
      text: "",
      datetime: defaultDatetime(blogDateOffset + i, 14),
      imageUrl: undefined,
    })),
  };
}

function buildSlotsFromTopics(
  topics: Topic[],
  contentByTopicId: Record<number, Record<string, unknown>> = {}
): Slot[] {
  const topicIdsWithContent = new Set(
    Object.keys(contentByTopicId)
      .map(Number)
      .filter((id) => {
        const c = contentByTopicId[id];
        const bh = (c?.blog_html ?? c?.blogHtml ?? ""); 
        const li = c?.linkedin_copy ?? c?.linkedinPost;
        const tw = c?.twitter_copy ?? c?.twitterPost;
        const ig = c?.instagram_copy ?? c?.instagramPost;
        if (bh && String(bh).trim()) return true;
        const hasLi = Array.isArray(li) ? li.some((x: unknown) => String(x || "").trim()) : String(li || "").trim();
        const hasTw = Array.isArray(tw) ? tw.some((x: unknown) => String(x || "").trim()) : String(tw || "").trim();
        const hasIg = Array.isArray(ig) ? ig.some((x: unknown) => String(x || "").trim()) : String(ig || "").trim();
        return hasLi || hasTw || hasIg;
      })
  );
  const withContent = topics.filter((t) => topicIdsWithContent.has(t.id));
  const withoutContent = topics.filter((t) => !topicIdsWithContent.has(t.id));
  const ordered = [...withContent, ...withoutContent];
  if (ordered.length === 0) return [];
  const lastGen = typeof window !== "undefined" ? sessionStorage.getItem("content-app:lastGeneratedTopicId") : null;
  const prioritizeId = lastGen ? parseInt(lastGen, 10) : null;
  if (prioritizeId != null && !Number.isNaN(prioritizeId) && !topicIdsWithContent.has(prioritizeId)) {
    const idx = withoutContent.findIndex((t) => t.id === prioritizeId);
    if (idx >= 0) {
      const rest = withoutContent.filter((_, i) => i !== idx);
      ordered.length = 0;
      ordered.push(...withContent, withoutContent[idx], ...rest);
    }
    try { sessionStorage.removeItem("content-app:lastGeneratedTopicId"); } catch { /* ignore */ }
  }
  // IMPORTANT: don't cycle topics into multiple tabs.
  // A tab should exist only for topics that were submitted into Review.
  const tabCount = Math.min(MAX_TABS, ordered.length);
  const base = Array.from({ length: tabCount }, (_, i) => {
    const topic = ordered[i];
    const slot = defaultSlot(
      `slot-${Date.now()}-${i}`,
      i * 3,
      topic?.id ?? null,
      topic?.title ?? ""
    );
    const topicId = topic?.id;
    if (topicId != null && contentByTopicId[topicId]) {
      return applyContentToSlot(slot, contentByTopicId[topicId]);
    }
    return slot;
  });
  return base.sort((a, b) => a.blogDate.localeCompare(b.blogDate));
}

const pad = <T,>(arr: T[], n: number, fill: T): T[] =>
  arr.length >= n ? arr.slice(0, n) : [...arr, ...Array(n - arr.length).fill(fill)];

/** True when item is ready to be posted. Instagram requires image. */
/** coverImageUrl not used — blog image stays local; social posts need their own images. */
function isApproved(
  platform: "linkedin" | "twitter" | "instagram",
  post: SocialPost,
  getStoredImg: (topicId: number, type: "LINKEDIN" | "INSTAGRAM", index?: number) => string | null,
  topicId: number | null,
  index: number
): boolean {
  const hasText = (post.text ?? "").trim().length > 0;
  if (platform === "instagram") {
    const hasImg = !!(post.imageUrl ?? (topicId != null ? getStoredImg(topicId, "INSTAGRAM", index) : null));
    return hasText && !!hasImg;
  }
  return hasText;
}

/** Ensure we never .map() over a non-array (prevents React render crash from flat DB columns). */
function safeSocialArray<T>(arr: unknown, defaultValue: T[]): T[] {
  return Array.isArray(arr) ? arr : defaultValue;
}

function applyContentToSlot(s: Slot, data: Record<string, unknown>): Slot {
  const d = data as {
    blogHtml?: string;
    blog_html?: string;
    linkedinPost?: string;
    linkedin_copy?: string[];
    twitterPost?: string;
    twitter_copy?: string[];
    instagramPost?: string;
    instagram_copy?: string[];
    metaDescription?: string;
    meta_description?: string;
    seoTags?: string[];
    seo_tags?: string[];
    image_url?: string | null;
    linkedin_image_urls?: string[];
    instagram_image_urls?: string[];
    scheduled_date?: string | null;
  };
  const blogHtml = String(d.blogHtml ?? d.blog_html ?? "").trim();
  const liFlat = d.linkedinPost ?? (d as Record<string, unknown>).linkedin_post;
  const twFlat = d.twitterPost ?? (d as Record<string, unknown>).twitter_post;
  const igFlat = d.instagramPost ?? (d as Record<string, unknown>).instagram_post;
  const liRaw = d.linkedin_copy ?? (typeof liFlat === "string" ? [liFlat] : []);
  const twRaw = d.twitter_copy ?? (typeof twFlat === "string" ? [twFlat] : []);
  const igRaw = d.instagram_copy ?? (typeof igFlat === "string" ? [igFlat] : []);
  const toArr = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
    if (typeof v === "string" && v.trim()) {
      try {
        const parsed = JSON.parse(v) as unknown;
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [v];
      } catch {
        return [v];
      }
    }
    return [];
  };
  const li = pad(toArr(liRaw), LINKEDIN_COUNT, "");
  const tw = pad(toArr(twRaw), TWITTER_COUNT, "");
  const ig = pad(toArr(igRaw), INSTAGRAM_COUNT, "");
  const scheduled = d.scheduled_date ? String(d.scheduled_date).slice(0, 16) : null;
  const metaDesc = d.metaDescription ?? d.meta_description ?? "";
  const seo = d.seoTags ?? d.seo_tags;
  const seoTagsStr = Array.isArray(seo) ? seo.join(", ") : typeof seo === "string" ? seo : "";
  const coverFromApi = d.image_url != null && d.image_url !== "" ? d.image_url : null;
  const liUrls = Array.isArray(d.linkedin_image_urls) ? d.linkedin_image_urls.filter((x): x is string => typeof x === "string") : [];
  const igUrls = Array.isArray(d.instagram_image_urls) ? d.instagram_image_urls.filter((x): x is string => typeof x === "string") : [];
  return {
    ...s,
    blogHtml: blogHtml || "",
    metaDescription: metaDesc || "",
    seoTags: seoTagsStr || "",
    coverImageUrl: coverFromApi ?? s.coverImageUrl ?? null,
    linkedin: s.linkedin.map((p, i) => ({
      ...p,
      text: (li[i] ?? "") || "",
      datetime: scheduled ?? p.datetime,
      imageUrl: (liUrls[i] ?? p.imageUrl) || undefined,
    })),
    twitter: s.twitter.map((p, i) => ({ ...p, text: (tw[i] ?? "") || "", datetime: scheduled ?? p.datetime })),
    instagram: s.instagram.map((p, i) => ({
      ...p,
      text: (ig[i] ?? "") || "",
      datetime: scheduled ?? p.datetime,
      imageUrl: (igUrls[i] ?? p.imageUrl) || undefined,
    })),
  };
}

const GENERATED_IMAGE_PREFIX = "content-app:generated-image:";
const VISUAL_CYCLE_KEY = "content-app:visual-cycle";

type VisualCycleScope = "blog" | "linkedin" | "twitter" | "instagram";

function getVisualCycleIndex(scope: VisualCycleScope): number {
  try {
    const raw = sessionStorage.getItem(VISUAL_CYCLE_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed[scope] ?? 0;
  } catch {
    return 0;
  }
}

function incrementVisualCycleIndex(scope: VisualCycleScope): void {
  try {
    const raw = sessionStorage.getItem(VISUAL_CYCLE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const mod = scope === "blog" ? 5 : 3;
    parsed[scope] = ((parsed[scope] ?? 0) + 1) % mod;
    sessionStorage.setItem(VISUAL_CYCLE_KEY, JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

function getStoredImageUrl(topicId: number, type: "cover" | "LINKEDIN" | "INSTAGRAM", index?: number): string | null {
  try {
    const key =
      type === "cover"
        ? `${GENERATED_IMAGE_PREFIX}${topicId}:cover`
        : `${GENERATED_IMAGE_PREFIX}${topicId}:${type}:${index ?? 0}`;
    const v = sessionStorage.getItem(key);
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function setStoredImageUrl(topicId: number, type: "cover" | "LINKEDIN" | "INSTAGRAM", index: number | undefined, url: string): void {
  try {
    const key =
      type === "cover"
        ? `${GENERATED_IMAGE_PREFIX}${topicId}:cover`
        : `${GENERATED_IMAGE_PREFIX}${topicId}:${type}:${index ?? 0}`;
    sessionStorage.setItem(key, url);
  } catch {
    /* ignore quota etc */
  }
}

function clearStoredImageUrl(topicId: number, type: "cover" | "LINKEDIN" | "INSTAGRAM", index?: number): void {
  try {
    const key =
      type === "cover"
        ? `${GENERATED_IMAGE_PREFIX}${topicId}:cover`
        : `${GENERATED_IMAGE_PREFIX}${topicId}:${type}:${index ?? 0}`;
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Restore generated image URLs from sessionStorage so they persist like text content. */
function hydrateSlotGeneratedImages(slot: Slot): Slot {
  const topicId = slot.topicId;
  if (topicId == null) return slot;
  const cover = getStoredImageUrl(topicId, "cover");
  const linkedin = slot.linkedin.map((p, i) => ({
    ...p,
    imageUrl: p.imageUrl ?? getStoredImageUrl(topicId, "LINKEDIN", i) ?? undefined,
  }));
  const instagram = slot.instagram.map((p, i) => ({
    ...p,
    imageUrl: p.imageUrl ?? getStoredImageUrl(topicId, "INSTAGRAM", i) ?? undefined,
  }));
  const coverImageUrl = slot.coverImageUrl ?? cover ?? null;
  return {
    ...slot,
    coverImageUrl,
    linkedin,
    instagram,
  };
}

export default function ReviewPage() {
  const [reviewTopics, setReviewTopics] = useState<Topic[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [toast, setToast] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [generatingSlotId, setGeneratingSlotId] = useState<string | null>(null);
  const [generatingImageFor, setGeneratingImageFor] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const rateLimitTimerRef = useRef<number | null>(null);
  const slotsRef = useRef<Slot[]>([]);
  slotsRef.current = slots;
  /** Persist generated image URLs so they survive re-renders / state overwrites (e.g. refetch). */
  const generatedImageByKeyRef = useRef<Record<string, string>>({});
  /** Visual identity prompts from config — used for cycling. */
  const visualPromptsRef = useRef<{ blog: string[]; linkedin: string[]; twitter: string[]; instagram: string[] }>({ blog: [], linkedin: [], twitter: [], instagram: [] });
  const [regenerateModal, setRegenerateModal] = useState<{
    open: boolean;
    scope: "blog" | "linkedin" | "twitter" | "instagram";
    index?: number;
  }>({ open: false, scope: "blog" });
  /** Persist removals across refetches; key = topicId-platform-index */
  const [removedImageKeys, setRemovedImageKeys] = useState<Set<string>>(new Set());
  /** For Ctrl+Z undo: stores state before last undoable action */
  const undoRef = useRef<{ slots: Slot[]; removedImageKeys: Set<string>; reviewTopics: Topic[]; approvalRevert?: { topicId: number } } | null>(null);
  /** Per-topic indices already posted (so scheduler won't double-post). Updated when content loads and when user clicks Publish now. */
  const [postedIndicesByTopicId, setPostedIndicesByTopicId] = useState<Record<number, { linkedin: number[]; twitter: number[]; instagram: number[] }>>({});
  const [publishingSegment, setPublishingSegment] = useState<string | null>(null);

  // Tabs always in chronological order
  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.blogDate.localeCompare(b.blogDate)),
    [slots]
  );

  const activeSlot = sortedSlots.find((s) => s.id === activeSlotId) ?? sortedSlots[0] ?? null;

  const setActiveSlot = (updater: (s: Slot) => Slot) => {
    if (!activeSlot) return;
    setSlots((prev) =>
      prev.map((s) => (s.id === activeSlot.id ? updater(s) : s))
    );
  };

  const pushUndoState = useCallback((approvalRevert?: { topicId: number }) => {
    undoRef.current = {
      slots: JSON.parse(JSON.stringify(slotsRef.current)),
      removedImageKeys: new Set(removedImageKeys),
      reviewTopics: [...reviewTopics],
      ...(approvalRevert && { approvalRevert }),
    };
  }, [removedImageKeys, reviewTopics]);

  const performUndo = useCallback(() => {
    const entry = undoRef.current;
    if (!entry) return;
    setSlots(entry.slots);
    setRemovedImageKeys(new Set(entry.removedImageKeys));
    setReviewTopics(entry.reviewTopics);
    if (entry.approvalRevert) {
      fetch(`/api/topics/${entry.approvalRevert.topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Review" }),
      }).catch(() => {});
    }
    undoRef.current = null;
    setToastMsg("Undone.");
    setToast(true);
    setTimeout(() => setToast(false), 2000);
  }, []);

  const fetchAndApplyContent = useCallback((topicList: Topic[], contentList: unknown[]) => {
    setReviewTopics(topicList);
    const list = Array.isArray(topicList) ? topicList : [];
    const contentArr = Array.isArray(contentList) ? contentList : [];
    const contentByTopicId: Record<number, Record<string, unknown>> = {};
    for (const c of contentArr) {
      const rec = c as Record<string, unknown>;
      const tid = rec.topic_id ?? rec.topicId;
      if (typeof tid === "number") contentByTopicId[tid] = rec;
    }
    for (const t of list) {
      const rec = t as Record<string, unknown>;
      const tid = t.id;
      if (typeof tid === "number" && (rec.blogHtml != null || rec.linkedinPost != null || rec.twitterPost != null || rec.instagramPost != null || rec.imageUrl != null || rec.image_url != null)) {
        contentByTopicId[tid] = { ...contentByTopicId[tid], ...rec, topic_id: tid, topicId: tid };
      }
    }
    const newSlots = list.length > 0 ? buildSlotsFromTopics(list, contentByTopicId) : [];
    setSlots(newSlots);
    setActiveSlotId((prev) => {
      if (!prev || !newSlots.some((s) => s.id === prev)) return newSlots[0]?.id ?? null;
      return prev;
    });
  }, []);

  // Load config for visual identity prompts (for cycling)
  useEffect(() => {
    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          const blog = Array.isArray(data.blog_visual_prompts) ? data.blog_visual_prompts : [];
          const linkedin = Array.isArray(data.linkedin_visual_prompts) ? data.linkedin_visual_prompts : [];
          const twitter = Array.isArray(data.twitter_visual_prompts) ? data.twitter_visual_prompts : [];
          const instagram = Array.isArray(data.instagram_visual_prompts) ? data.instagram_visual_prompts : [];
          visualPromptsRef.current = {
            blog: blog.filter((x: unknown) => typeof x === "string"),
            linkedin: linkedin.filter((x: unknown) => typeof x === "string"),
            twitter: twitter.filter((x: unknown) => typeof x === "string"),
            instagram: instagram.filter((x: unknown) => typeof x === "string"),
          };
        }
      })
      .catch(() => {});
  }, []);

  // Load topics (Review) and content from DB. If we already have slots (e.g. user generated before load finished), merge content in instead of replacing to avoid wiping generated content.
  useEffect(() => {
    Promise.all([
      fetch("/api/topics?status=Review").then((res) => res.json()),
      fetch("/api/content?status=review").then((res) => res.json()),
    ])
      .then(([topicsData, contentData]) => {
        const list = Array.isArray(topicsData) ? topicsData : [];
        const contentList = Array.isArray(contentData) ? contentData : [];
        const contentByTopicId: Record<number, Record<string, unknown>> = {};
        for (const c of contentList) {
          const rec = c as Record<string, unknown>;
          const tid = rec.topic_id ?? rec.topicId;
          if (typeof tid === "number") contentByTopicId[tid] = rec;
        }
        const postedByTopic: Record<number, { linkedin: number[]; twitter: number[]; instagram: number[] }> = {};
        for (const c of contentList) {
          const rec = c as Record<string, unknown>;
          const tid = rec.topic_id ?? rec.topicId;
          if (typeof tid !== "number") continue;
          const li = rec.linkedin_posted_indices;
          const tw = rec.twitter_posted_indices;
          const ig = rec.instagram_posted_indices;
          postedByTopic[tid] = {
            linkedin: Array.isArray(li) ? li.filter((x: unknown) => typeof x === "number") : [],
            twitter: Array.isArray(tw) ? tw.filter((x: unknown) => typeof x === "number") : [],
            instagram: Array.isArray(ig) ? ig.filter((x: unknown) => typeof x === "number") : [],
          };
        }
        setPostedIndicesByTopicId((prev) => ({ ...prev, ...postedByTopic }));
        for (const t of list) {
          const rec = t as Record<string, unknown>;
          const tid = t.id;
          if (typeof tid === "number" && (rec.blogHtml != null || rec.linkedinPost != null || rec.twitterPost != null || rec.instagramPost != null || rec.imageUrl != null || rec.image_url != null)) {
            contentByTopicId[tid] = { ...contentByTopicId[tid], ...rec, topic_id: tid, topicId: tid };
          }
        }
        for (const t of list) {
          const tid = t.id;
          if (typeof tid !== "number") continue;
          try {
            const stored = sessionStorage.getItem(`content-app:content:${tid}`);
            if (stored) {
              const parsed = JSON.parse(stored) as Record<string, unknown>;
              if (parsed && typeof parsed === "object") {
                contentByTopicId[tid] = { ...contentByTopicId[tid], ...parsed, topic_id: tid, topicId: tid };
              }
            }
          } catch {
            /* ignore */
          }
        }
        const hasSlots = slotsRef.current.length > 0;
        if (hasSlots) {
          setSlots((prev) =>
            prev.map((s) => {
              const c = s.topicId != null ? contentByTopicId[s.topicId] : null;
              if (!c || typeof c !== "object") return s;
              const next = hydrateSlotGeneratedImages(applyContentToSlot(s, c));
              if (next.topicId != null && next.coverImageUrl) {
                generatedImageByKeyRef.current[`${next.topicId}-cover`] = next.coverImageUrl;
              }
              return next;
            })
          );
        } else {
          const newSlots = list.length > 0 ? buildSlotsFromTopics(list, contentByTopicId) : [];
          const hydrated = newSlots.map(hydrateSlotGeneratedImages);
          hydrated.forEach((s) => {
            if (s.topicId != null && s.coverImageUrl) {
              generatedImageByKeyRef.current[`${s.topicId}-cover`] = s.coverImageUrl;
            }
          });
          setSlots(hydrated);
          setActiveSlotId(newSlots[0]?.id ?? null);
        }
        setReviewTopics(list);
      })
      .catch(() => {
        setReviewTopics([]);
        setSlots([]);
        setActiveSlotId(null);
      })
      .finally(() => setLoadingTopics(false));
  }, []);

  // Refetch when tab becomes visible: merge content into existing slots (do not replace slots or we lose in-memory generated content)
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      Promise.all([
        fetch("/api/topics?status=Review").then((res) => res.json()),
        fetch("/api/content?status=review").then((res) => res.json()),
      ]).then(([topicsData, contentData]) => {
        const contentArr = Array.isArray(contentData) ? contentData : [];
        const list = Array.isArray(topicsData) ? topicsData : [];
        const contentByTopicId: Record<number, Record<string, unknown>> = {};
        for (const c of contentArr) {
          const rec = c as Record<string, unknown>;
          const tid = rec.topic_id ?? rec.topicId;
          if (typeof tid === "number") contentByTopicId[tid] = rec;
        }
        const postedByTopic: Record<number, { linkedin: number[]; twitter: number[]; instagram: number[] }> = {};
        for (const c of contentArr) {
          const rec = c as Record<string, unknown>;
          const tid = rec.topic_id ?? rec.topicId;
          if (typeof tid !== "number") continue;
          postedByTopic[tid] = {
            linkedin: Array.isArray(rec.linkedin_posted_indices) ? rec.linkedin_posted_indices.filter((x: unknown) => typeof x === "number") : [],
            twitter: Array.isArray(rec.twitter_posted_indices) ? rec.twitter_posted_indices.filter((x: unknown) => typeof x === "number") : [],
            instagram: Array.isArray(rec.instagram_posted_indices) ? rec.instagram_posted_indices.filter((x: unknown) => typeof x === "number") : [],
          };
        }
        setPostedIndicesByTopicId((prev) => ({ ...prev, ...postedByTopic }));
        for (const t of list) {
          const tid = t.id;
          if (typeof tid !== "number") continue;
          try {
            const stored = sessionStorage.getItem(`content-app:content:${tid}`);
            if (stored) {
              const parsed = JSON.parse(stored) as Record<string, unknown>;
              if (parsed && typeof parsed === "object") contentByTopicId[tid] = { ...contentByTopicId[tid], ...parsed, topic_id: tid, topicId: tid };
            }
          } catch {
            /* ignore */
          }
        }
        setSlots((prev) => {
          if (prev.length === 0) return prev;
          return prev.map((s) => {
            const c = s.topicId != null ? contentByTopicId[s.topicId] : null;
            if (!c || typeof c !== "object") return s;
            const next = hydrateSlotGeneratedImages(applyContentToSlot(s, c));
            if (next.topicId != null && next.coverImageUrl) {
              generatedImageByKeyRef.current[`${next.topicId}-cover`] = next.coverImageUrl;
            }
            return next;
          });
        });
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, []);

  const generateForSlot = async (slot: Slot) => {
    if (slot.topicId == null) return;
    if (rateLimited) return;
    const slotIdToUpdate = slot.id;
    setGeneratingSlotId(slotIdToUpdate);
    try {
      const genRes = await fetch(`/api/generate?topicId=${slot.topicId}`, { method: "POST" });
      const rawText = await genRes.text();
      let json: { content?: Record<string, unknown>; modelUsed?: string; error?: string };
      try {
        json = rawText ? (JSON.parse(rawText) as { content?: Record<string, unknown>; modelUsed?: string; error?: string }) : {};
      } catch {
        setToastMsg("Generate failed: invalid response.");
        setToast(true);
        setTimeout(() => setToast(false), 3000);
        return;
      }
      if (!genRes.ok) {
        if (genRes.status === 429) {
          setRateLimited(true);
          if (rateLimitTimerRef.current) window.clearTimeout(rateLimitTimerRef.current);
          rateLimitTimerRef.current = window.setTimeout(() => setRateLimited(false), 60_000);
        }
        setToastMsg(json?.error ?? "Generate failed");
        setToast(true);
        setTimeout(() => setToast(false), 3000);
        return;
      }
      const data = json.content ?? null;
      if (data && typeof data === "object") {
        if (slot.topicId != null) {
          try {
            sessionStorage.setItem(`content-app:content:${slot.topicId}`, JSON.stringify(data));
          } catch {
            /* ignore */
          }
        }
        setSlots((prev) =>
          prev.map((s) => (s.id === slotIdToUpdate ? hydrateSlotGeneratedImages(applyContentToSlot(s, data)) : s))
        );
        setToastMsg(
          json.modelUsed === "2.5-flash"
            ? "Content generated. Generated with Flash due to Pro demand."
            : "Content generated."
        );
        setToast(true);
        setTimeout(() => setToast(false), 2500);
      } else {
        setToastMsg("Generated but no content in response.");
        setToast(true);
        setTimeout(() => setToast(false), 4000);
      }
    } catch (e) {
      setToastMsg("Generate failed.");
      setToast(true);
      setTimeout(() => setToast(false), 3000);
    } finally {
      setGeneratingSlotId(null);
    }
  };

  const generateSocialForSlot = async (slot: Slot) => {
    if (slot.topicId == null) return;
    if (rateLimited) return;
    setGeneratingSlotId(slot.id);
    try {
      const genRes = await fetch(`/api/generate-social?topicId=${slot.topicId}`, { method: "POST" });
      if (!genRes.ok) {
        if (genRes.status === 429) {
          setRateLimited(true);
          if (rateLimitTimerRef.current) window.clearTimeout(rateLimitTimerRef.current);
          rateLimitTimerRef.current = window.setTimeout(() => setRateLimited(false), 60_000);
        }
        const err = await genRes.json().catch(() => ({}));
        setToastMsg((err as { error?: string })?.error ?? "Generate social failed");
        setToast(true);
        setTimeout(() => setToast(false), 3000);
        setGeneratingSlotId(null);
        return;
      }
      const json = (await genRes.json()) as { content?: Record<string, unknown>; error?: string };
      const data = json.content ?? (await fetch(`/api/content?topicId=${slot.topicId}`).then((r) => r.json()).catch(() => null));
      if (data && typeof data === "object") {
        setSlots((prev) =>
          prev.map((s) => {
            if (s.id !== slot.id) return s;
            return hydrateSlotGeneratedImages(applyContentToSlot(s, { blogHtml: s.blogHtml, metaDescription: s.metaDescription, seoTags: s.seoTags, ...data }));
          })
        );
        setToastMsg("Social posts generated.");
        setToast(true);
        setTimeout(() => setToast(false), 2500);
      } else {
        setToastMsg("Social generated but no content in response.");
        setToast(true);
        setTimeout(() => setToast(false), 3000);
      }
    } catch (_) {
      setToastMsg("Generate social failed.");
      setToast(true);
      setTimeout(() => setToast(false), 3000);
    } finally {
      setGeneratingSlotId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (rateLimitTimerRef.current) window.clearTimeout(rateLimitTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        const target = e.target as HTMLElement;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
        e.preventDefault();
        performUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [performUndo]);

  const handleMarkAsPosted = () => {
    if (!activeSlot) return;
    const activeIndex = slots.findIndex((s) => s.id === activeSlot.id);
    const topic = reviewTopics[(activeIndex + 1) % Math.max(1, reviewTopics.length)];
    const rest = slots.filter((s) => s.id !== activeSlot.id);
    const nextId = `slot-${Date.now()}`;
    const lastDate = rest.length > 0 ? rest.map((s) => s.blogDate).sort().pop()! : activeSlot.blogDate;
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const newSlot = defaultSlot(nextId, 0, topic?.id ?? null, topic?.title ?? "");
    newSlot.blogDate = nextDate.toISOString().slice(0, 10);
    const updated = [...rest, newSlot].sort((a, b) => a.blogDate.localeCompare(b.blogDate));
    setSlots(updated);
    setActiveSlotId(updated[0]?.id ?? null);
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
        meta_description: activeSlot.metaDescription || null,
        seo_tags: activeSlot.seoTags || null,
        linkedin_copy: activeSlot.linkedin.map((p) => p.text),
        twitter_copy: activeSlot.twitter.map((p) => p.text),
        instagram_copy: activeSlot.instagram.map((p) => p.text),
        image_url: activeSlot.coverImageUrl ?? null,
        linkedin_image_urls: activeSlot.linkedin.map((p) => p.imageUrl).filter((u): u is string => !!u),
        instagram_image_urls: activeSlot.instagram.map((p) => p.imageUrl).filter((u): u is string => !!u),
        scheduled_date: defaultBlogScheduledDate(activeSlot.blogDate),
        status: "Scheduled",
      }),
    })
      .then((res) => {
        if (res.ok) {
          setToastMsg("Saved & scheduled.");
          setToast(true);
          setTimeout(() => setToast(false), 3000);
        }
      })
      .catch(() => {});
  };

  const approveAndSchedule = async () => {
    if (activeSlot?.topicId == null || !activeSlot) return;
    pushUndoState({ topicId: activeSlot.topicId });

    const liIncluded = activeSlot.linkedin.filter((p) => !p.excluded);
    const twIncluded = activeSlot.twitter.filter((p) => !p.excluded);
    const igIncluded = activeSlot.instagram.filter((p) => !p.excluded);

    // Block: Instagram posts require their own image (blog cover is not used)
    const igWithoutImage = igIncluded.filter((p) => {
      const origIdx = activeSlot.instagram.indexOf(p);
      const key = `${activeSlot.topicId}-INSTAGRAM-${origIdx}`;
      const removed = removedImageKeys.has(key);
      const hasImg = !removed && !!(p.imageUrl ?? generatedImageByKeyRef.current[key]);
      return (p.text ?? "").trim().length > 0 && !hasImg;
    });
    if (igWithoutImage.length > 0) {
      setToastMsg("Instagram posts require an image. Add an image or exclude those posts.");
      setToast(true);
      setTimeout(() => setToast(false), 4000);
      return;
    }

    const linkedinCopy = liIncluded.map((p) => p.text);
    const twitterCopy = twIncluded.map((p) => p.text);
    const instagramCopy = igIncluded.map((p) => p.text);
    const linkedinImageUrls = liIncluded.map((p) => p.imageUrl).filter((u): u is string => !!u);
    const instagramImageUrls = igIncluded.map((p) => {
      const origIdx = activeSlot.instagram.indexOf(p);
      const key = `${activeSlot.topicId}-INSTAGRAM-${origIdx}`;
      if (removedImageKeys.has(key)) return "";
      return p.imageUrl ?? generatedImageByKeyRef.current[key] ?? "";
    }).filter(Boolean);

    const scheduledDate = defaultBlogScheduledDate(activeSlot.blogDate);
    const displayDate = scheduledDate
      ? new Date(scheduledDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : activeSlot.blogDate
        ? new Date(activeSlot.blogDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : "the scheduled date";

    const blogHtml = activeSlot.blogExcluded ? "" : (activeSlot.blogHtml ?? "");
    const metaDescription = activeSlot.blogExcluded ? "" : (activeSlot.metaDescription ?? "");
    const seoTags = activeSlot.blogExcluded ? "" : (activeSlot.seoTags ?? "");

    try {
      const contentRes = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic_id: activeSlot.topicId,
          blog_html: blogHtml,
          meta_description: metaDescription || null,
          seo_tags: seoTags || null,
          linkedin_copy: linkedinCopy,
          twitter_copy: twitterCopy,
          instagram_copy: instagramCopy,
          image_url: activeSlot.blogExcluded ? null : (activeSlot.coverImageUrl ?? null),
          linkedin_image_urls: linkedinImageUrls,
          instagram_image_urls: instagramImageUrls,
          scheduled_date: scheduledDate,
          status: "Scheduled",
        }),
      });
      if (!contentRes.ok) {
        setToastMsg("Failed to save content.");
        setToast(true);
        setTimeout(() => setToast(false), 3000);
        return;
      }

      const topicRes = await fetch(`/api/topics/${activeSlot.topicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Approved" }),
      });
      if (!topicRes.ok) {
        setToastMsg("Content saved but failed to set Approved status.");
        setToast(true);
        setTimeout(() => setToast(false), 3000);
        return;
      }

      setToastMsg(`Post approved! It will automatically publish on ${displayDate}.`);
      setToast(true);
      setTimeout(() => setToast(false), 5000);
      setReviewTopics((prev) =>
        prev.map((t) => (t.id === activeSlot.topicId ? { ...t, status: "Approved" } : t))
      );
    } catch {
      setToastMsg("Approve & schedule failed.");
      setToast(true);
      setTimeout(() => setToast(false), 3000);
    }
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
    if (activeSlot?.topicId == null || activeSlot?.id == null) return;
    const topicId = activeSlot.topicId;
    const slotId = activeSlot.id;
    const blogPrompts = visualPromptsRef.current.blog;
    const cycleIndex = getVisualCycleIndex("blog");
    const template = blogPrompts.length > 0
      ? (blogPrompts[cycleIndex % blogPrompts.length] ?? blogPrompts[0])
      : "Professional, clean, editorial. High quality, no text in image.";
    const context = activeSlot.topicTitle?.trim() || "Blog post";
    const prompt = `${template} Context: ${context}. Featured image for blog post. High quality, no text in image.`;
    generateImage(prompt, "cover").then((url) => {
      if (url) {
        incrementVisualCycleIndex("blog");
        generatedImageByKeyRef.current[`${topicId}-cover`] = url;
        setStoredImageUrl(topicId, "cover", undefined, url);
        setSlots((prev) =>
          prev.map((s) => (s.id === slotId ? { ...s, coverImageUrl: url } : s))
        );
      }
      setGeneratingImageFor(null);
    });
  };

  const handleGenerateLinkedInImage = (index: number) => {
    // Route legacy camera button to the strict Imagen flow so it always populates and follows cadence.
    void handleGenerateImageViaImagen("LINKEDIN", index);
  };

  const handleRegeneratePiece = async (context: string) => {
    if (!activeSlot?.topicId) {
      setToastMsg("No topic selected. Select a tab with content to regenerate.");
      setToast(true);
      setTimeout(() => setToast(false), 3000);
      return;
    }
    const scope = regenerateModal.scope === "blog" ? "all" : regenerateModal.scope;
    const index = regenerateModal.index ?? 0;
    setGeneratingSlotId(activeSlot.id);
    try {
      const res = await fetch("/api/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: activeSlot.topicId,
          scope,
          context,
          index,
          blogHtml: activeSlot.blogHtml ?? "",
          blogTitle: activeSlot.topicTitle ?? "",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; content?: Record<string, unknown>; error?: string };
      if (!res.ok) {
        setToastMsg(data?.error ?? "Regeneration failed");
        setToast(true);
        setTimeout(() => setToast(false), 3000);
        return;
      }
      if (data.content) {
        try {
          sessionStorage.setItem(`content-app:content:${activeSlot.topicId}`, JSON.stringify(data.content));
        } catch {
          /* ignore */
        }
        const merged = {
          ...data.content,
          blogHtml: data.content.blogHtml ?? activeSlot.blogHtml,
          metaDescription: data.content.metaDescription ?? activeSlot.metaDescription,
          seoTags: data.content.seoTags ?? activeSlot.seoTags,
        };
        setSlots((prev) =>
          prev.map((s) => (s.id === activeSlot.id ? hydrateSlotGeneratedImages(applyContentToSlot(s, merged)) : s))
        );
        setToastMsg("Content regenerated.");
        setToast(true);
        setTimeout(() => setToast(false), 2500);
      }
      setRegenerateModal({ open: false, scope: "blog" });
    } catch {
      setToastMsg("Regeneration failed.");
      setToast(true);
      setTimeout(() => setToast(false), 3000);
    } finally {
      setGeneratingSlotId(null);
    }
  };

  const handleGenerateInstagramImage = (index: number) => {
    // Route legacy camera button to the strict Imagen flow so it always populates and follows cadence.
    void handleGenerateImageViaImagen("INSTAGRAM", index);
  };

  /** Call Imagen API with topicId + type + index; show loading and set image on slot. Cycles through social visual prompts. */
  const handleGenerateImageViaImagen = async (type: "LINKEDIN" | "INSTAGRAM", index: number) => {
    if (activeSlot?.topicId == null || activeSlot?.id == null) {
      setToastMsg("Select a topic tab first.");
      setToast(true);
      setTimeout(() => setToast(false), 2500);
      return;
    }
    const topicId = activeSlot.topicId;
    const slotId = activeSlot.id;
    const cacheKey = `${topicId}-${type}-${index}`;
    const key = type === "LINKEDIN" ? `li-${index}` : `ig-${index}`;
    const cycleIndex = getVisualCycleIndex(type === "LINKEDIN" ? "linkedin" : "instagram");
    setGeneratingImageFor(key);
    try {
      const caption =
        type === "LINKEDIN"
          ? (activeSlot?.linkedin[index]?.text ?? "").trim()
          : (activeSlot?.instagram[index]?.text ?? "").trim();
      const post_type: "cady" | "scramble" | "text" = index === 0 ? "cady" : index === 1 ? "scramble" : "text";
      const hookText = (activeSlot?.topicTitle ?? "").trim();
      const imagePrompt =
        post_type === "cady"
          ? "Generate a high-quality 3D claymation scene using the provided reference image of Cady. Show Cady confidently pointing to a rising chart. Maintain the exact character design, white background, and remove bottom-right watermarks. Max 2-3 minimalist props."
          : post_type === "scramble"
            ? "Generate a high-quality 3D claymation scene using the provided reference image of Scramble (the purple character). Show Scramble pulling his hair out at a desk covered in spreadsheets. Maintain the exact character design, white background, and remove bottom-right watermarks. Max 2-3 minimalist props."
            : `Use the provided reference image template. Replace the center text with this exact phrase: ${hookText || "The main question from this article"}.`;
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, type, index, caption: caption || undefined, cycleIndex, post_type, imagePrompt, hookText }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; base64?: string; error?: string };
      const url = data.url ?? (data.base64 ? `data:image/png;base64,${data.base64}` : null);
      if (url) {
        const removalKey = `${topicId}-${type}-${index}`;
        setRemovedImageKeys((prev) => {
          const next = new Set(prev);
          next.delete(removalKey);
          return next;
        });
        incrementVisualCycleIndex(type === "LINKEDIN" ? "linkedin" : "instagram");
        generatedImageByKeyRef.current[cacheKey] = url;
        setStoredImageUrl(topicId, type, index, url);
        if (type === "LINKEDIN") {
          setSlots((prev) =>
            prev.map((s) =>
              s.id === slotId
                ? { ...s, linkedin: s.linkedin.map((p, i) => (i === index ? { ...p, imageUrl: url } : p)) }
                : s
            )
          );
        } else {
          setSlots((prev) =>
            prev.map((s) =>
              s.id === slotId
                ? { ...s, instagram: s.instagram.map((p, i) => (i === index ? { ...p, imageUrl: url } : p)) }
                : s
            )
          );
        }
        setToastMsg("Image generated.");
        setToast(true);
        setTimeout(() => setToast(false), 2000);
      } else {
        setToastMsg(data?.error ?? "Image generation failed.");
        setToast(true);
        setTimeout(() => setToast(false), 3000);
      }
    } catch {
      setToastMsg("Image generation failed.");
      setToast(true);
      setTimeout(() => setToast(false), 3000);
    } finally {
      setGeneratingImageFor(null);
    }
  };

  const handleRemoveLinkedInImage = (index: number) => {
    if (activeSlot?.topicId == null || activeSlot?.id == null) return;
    pushUndoState();
    const topicId = activeSlot.topicId;
    const slotId = activeSlot.id;
    const removalKey = `${topicId}-LINKEDIN-${index}`;
    const cacheKey = removalKey;
    setRemovedImageKeys((prev) => new Set(prev).add(removalKey));
    delete generatedImageByKeyRef.current[cacheKey];
    clearStoredImageUrl(topicId, "LINKEDIN", index);
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, linkedin: s.linkedin.map((p, i) => (i === index ? { ...p, imageUrl: undefined } : p)) }
          : s
      )
    );
  };

  const handleRemoveInstagramImage = (index: number) => {
    if (activeSlot?.topicId == null || activeSlot?.id == null) return;
    pushUndoState();
    const topicId = activeSlot.topicId;
    const slotId = activeSlot.id;
    const removalKey = `${topicId}-INSTAGRAM-${index}`;
    const cacheKey = removalKey;
    setRemovedImageKeys((prev) => new Set(prev).add(removalKey));
    delete generatedImageByKeyRef.current[cacheKey];
    clearStoredImageUrl(topicId, "INSTAGRAM", index);
    setSlots((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? { ...s, instagram: s.instagram.map((p, i) => (i === index ? { ...p, imageUrl: undefined } : p)) }
          : s
      )
    );
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
            Each tab = 3-day cycle (blog + social day 1, social days 2–3). Up to {MAX_TABS} post pages.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {reviewTopics.length === 0 && (
            <span style={{ color: "var(--text3)", fontSize: 13 }}>No topics in Review — add topics and set status to Review</span>
          )}
          <button
            className="btn btn-ghost"
            onClick={saveCurrentSlot}
            disabled={activeSlot?.topicId == null || !activeSlot}
            style={{ fontSize: 13 }}
          >
            <Icon d={icons.check} size={14} /> Save & Schedule
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (!activeSlot) return;
              pushUndoState();
              setActiveSlot((s) => ({ ...s, blogExcluded: true }));
              setToastMsg("Blog cancelled for this page.");
              setToast(true);
              setTimeout(() => setToast(false), 2500);
            }}
            disabled={activeSlot?.topicId == null || !activeSlot}
            style={{ color: "var(--text3)", fontSize: 13 }}
            title="Exclude blog from posting"
          >
            <Icon d={icons.x} size={14} /> Cancel blog
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (!activeSlot) return;
              pushUndoState();
              setSlots((prev) =>
                prev.map((s) =>
                  s.id === activeSlot.id
                    ? {
                        ...s,
                        blogExcluded: true,
                        linkedin: s.linkedin.map((p) => ({ ...p, excluded: true })),
                        twitter: s.twitter.map((p) => ({ ...p, excluded: true })),
                        instagram: s.instagram.map((p) => ({ ...p, excluded: true })),
                      }
                    : s
                )
              );
              setToastMsg("Schedule cancelled for this page.");
              setToast(true);
              setTimeout(() => setToast(false), 2500);
            }}
            disabled={activeSlot?.topicId == null || !activeSlot}
            style={{ color: "var(--text3)", fontSize: 13 }}
            title="Exclude all items on this page from posting"
          >
            <Icon d={icons.x} size={14} /> Cancel schedule
          </button>
          <button
            className="btn btn-primary"
            onClick={approveAndSchedule}
            disabled={activeSlot?.topicId == null || !activeSlot}
          >
            ✅ Approve & Schedule
          </button>
          <button
            className="btn btn-primary"
            disabled={!activeSlot || !(activeSlot.blogHtml ?? "").trim()}
            onClick={async () => {
              if (!activeSlot?.blogHtml?.trim()) return;
              const slugify = (t: string) =>
                t.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "post";
              try {
                setToastMsg("Publishing…");
                setToast(true);
                const res = await fetch("/api/publish-now", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: activeSlot.topicTitle || "Untitled",
                    slug: slugify(activeSlot.topicTitle || "post"),
                    htmlContent: activeSlot.blogHtml,
                    imageUrl: activeSlot.coverImageUrl ?? "",
                  }),
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  const msg = data.error || `Publish failed (${res.status})`;
                  console.error("[Publish now]", res.status, data);
                  throw new Error(msg);
                }
                setToastMsg("Blog published to GitHub.");
                setToast(true);
                setTimeout(() => setToast(false), 3500);
                window.location.reload();
              } catch (e) {
                const msg = e instanceof Error ? e.message : "Publish failed";
                console.error("[Publish now]", e);
                setToastMsg(msg);
                setToast(true);
                setTimeout(() => setToast(false), 3500);
              }
            }}
            style={{ background: "var(--accent)", color: "white" }}
            title="Publish this tab's blog to GitHub now"
          >
            <Icon d={icons.send} size={14} /> Publish Now
          </button>
        </div>
      </div>

      {/* Tabs: chronological by blog date; each has a Generate button */}
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
        {sortedSlots.map((slot) => {
          const isActive = activeSlot?.id === slot.id;
          return (
            <div
              key={slot.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                background: isActive ? "var(--accent-dim)" : "transparent",
                borderRadius: "var(--radius-sm) var(--radius-sm) 0 0",
              }}
            >
              <button
                type="button"
                onClick={() => setActiveSlotId(slot.id)}
                style={{
                  padding: "10px 8px 10px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: isActive ? "var(--accent)" : "var(--text2)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  textAlign: "left",
                }}
              >
                {new Date(slot.blogDate + "T12:00:00").toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {slot.topicTitle && (
                  <span style={{ marginLeft: 6, fontWeight: 400, color: "var(--text3)" }}>
                    · {slot.topicTitle.slice(0, 18)}{slot.topicTitle.length > 18 ? "…" : ""}
                  </span>
                )}
              </button>
              <button
                type="button"
                title="Generate this day's blog"
                onClick={(e) => {
                  e.stopPropagation();
                  generateForSlot(slot);
                }}
                disabled={slot.topicId == null || generatingSlotId !== null}
                style={{
                  padding: "6px 10px",
                  marginRight: 8,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--accent)",
                  background: "var(--accent-dim)",
                  border: "1px solid var(--accent-glow)",
                  borderRadius: "var(--radius-sm)",
                  cursor: slot.topicId != null && !generatingSlotId ? "pointer" : "not-allowed",
                  opacity: generatingSlotId && generatingSlotId !== slot.id ? 0.6 : 1,
                }}
              >
                {generatingSlotId === slot.id ? "…" : "Generate Blog"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="content" style={{ overflowY: "auto" }}>
        {!activeSlot ? (
          <div style={{ color: "var(--text3)" }}>
            {slots.length === 0 ? "No topics in Review — add topics and set status to Review." : "No slot selected."}
          </div>
        ) : (
          <div className="review-grid">
            {/* Left: Blog + cover image + date editor + Generate */}
            <div>
              <div style={{ marginBottom: 16, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                <span className="form-label" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 6 }}>
                  Blog Post
                  {!activeSlot.blogExcluded && (activeSlot.blogHtml ?? "").trim().length > 0 && (
                    <span title="Ready to post" style={{ color: "var(--success, #22c55e)", display: "inline-flex", alignItems: "center" }}>
                      <Icon d={icons.check} size={14} strokeWidth={2.5} />
                    </span>
                  )}
                </span>
                <input
                  type="date"
                  value={activeSlot.blogDate}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (!next) return;
                    setActiveSlot((s) => ({ ...s, blogDate: next }));
                  }}
                  style={{ fontSize: 12, padding: "6px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                />
                <span style={{ fontSize: 12, color: "var(--text3)" }}>publishes this date</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => generateForSlot(activeSlot)}
                  disabled={activeSlot.topicId == null || generatingSlotId !== null}
                  style={{ marginLeft: "auto" }}
                >
                  {generatingSlotId === activeSlot.id ? (
                    <>Generating…</>
                  ) : (
                    <><Icon d={icons.spark} size={14} /> Generate Blog</>
                  )}
                </button>
              </div>
              {(() => {
                const coverSrc = activeSlot.coverImageUrl ?? generatedImageByKeyRef.current[activeSlot?.topicId != null ? `${activeSlot.topicId}-cover` : ""] ?? "";
                return (
              <div
                className="image-placeholder"
                onClick={coverSrc ? undefined : handleGenerateCoverImage}
                style={coverSrc ? { padding: 0, height: 200 } : {}}
              >
                {coverSrc ? (
                  <img
                    src={coverSrc}
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
                );
              })()}
              {(activeSlot.coverImageUrl ?? generatedImageByKeyRef.current[activeSlot?.topicId != null ? `${activeSlot.topicId}-cover` : ""]) && (
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
              <div className="form-group" style={{ marginTop: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>Markdown Content</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11, color: activeSlot.blogExcluded ? "var(--accent)" : "var(--text3)" }}
                      onClick={() => {
                        pushUndoState();
                        setActiveSlot((s) => ({ ...s, blogExcluded: !s.blogExcluded }));
                      }}
                      title={activeSlot.blogExcluded ? "Include blog in post" : "Cancel / exclude blog from post"}
                    >
                      {activeSlot.blogExcluded ? "Include blog" : <><Icon d={icons.x} size={12} /> Cancel blog</>}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11 }}
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/preview-blog", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              title: activeSlot.topicTitle || "Untitled",
                              metaDescription: activeSlot.metaDescription || null,
                              seoTags: activeSlot.seoTags || null,
                              blogHtml: activeSlot.blogHtml || "",
                              imageUrl: activeSlot.coverImageUrl ?? generatedImageByKeyRef.current[activeSlot?.topicId != null ? `${activeSlot.topicId}-cover` : ""] ?? null,
                              blogDate: activeSlot.blogDate || null,
                            }),
                          });
                          if (!res.ok) throw new Error("Preview failed");
                          const html = await res.text();
                          const blob = new Blob([html], { type: "text/html" });
                          const url = URL.createObjectURL(blob);
                          window.open(url, "_blank", "noopener,noreferrer");
                          setTimeout(() => URL.revokeObjectURL(url), 10000);
                        } catch {
                          setToastMsg("Preview failed.");
                          setToast(true);
                          setTimeout(() => setToast(false), 3000);
                        }
                      }}
                      title="Open formatted blog preview in new tab"
                    >
                      <Icon d={icons.external} size={12} /> Preview
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: 11 }}
                      onClick={() => setRegenerateModal({ open: true, scope: "blog" })}
                      disabled={activeSlot.topicId == null || generatingSlotId !== null}
                      title="Regenerate blog with optional context"
                    >
                      <Icon d={icons.refresh} size={12} /> Regenerate
                    </button>
                    {activeSlot.topicId != null && (() => {
                      const topic = reviewTopics.find((t) => t.id === activeSlot.topicId);
                      const blogPosted = topic?.status === "Published";
                      const key = "blog";
                      const isPublishing = publishingSegment === key;
                      return blogPosted ? (
                        <span style={{ fontSize: 11, color: "var(--success, #22c55e)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Icon d={icons.check} size={12} /> Posted
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          style={{ fontSize: 11, padding: "4px 10px" }}
                          disabled={isPublishing || !(activeSlot.blogHtml ?? "").trim()}
                          onClick={async () => {
                            if (activeSlot.topicId == null) return;
                            const slugify = (t: string) =>
                              t.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "post";
                            setPublishingSegment(key);
                            try {
                              const res = await fetch("/api/publish-now", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  title: activeSlot.topicTitle || "Untitled",
                                  slug: slugify(activeSlot.topicTitle || "post"),
                                  htmlContent: activeSlot.blogHtml,
                                  imageUrl: activeSlot.coverImageUrl ?? "",
                                }),
                              });
                              if (!res.ok) {
                                const data = await res.json().catch(() => ({}));
                                const msg = data.error || `Publish failed (${res.status})`;
                                console.error("[Publish now]", res.status, data);
                                throw new Error(msg);
                              }
                              setToastMsg("Blog published to GitHub.");
                              setReviewTopics((prev) => prev.map((t) => t.id === activeSlot.topicId ? { ...t, status: "Published" } : t));
                            } catch (e) {
                              const msg = e instanceof Error ? e.message : "Publish failed";
                              console.error("[Publish now]", e);
                              setToastMsg(msg);
                            } finally {
                              setPublishingSegment(null);
                              setToast(true);
                              setTimeout(() => setToast(false), 3000);
                            }
                          }}
                          title="Publish this blog to GitHub now"
                        >
                          {isPublishing ? "…" : <><Icon d={icons.send} size={12} /> Publish now</>}
                        </button>
                      );
                    })()}
                  </div>
                </div>
                <textarea
                  rows={28}
                  value={(activeSlot.blogHtml ?? "") || ""}
                  onChange={(e) => setActiveSlot((s) => ({ ...s, blogHtml: e.target.value }))}
                  placeholder="Blog Markdown…"
                  style={{ fontFamily: "monospace", fontSize: 12.5, lineHeight: 1.6 }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Meta Description</label>
                <input
                  type="text"
                  value={(activeSlot.metaDescription ?? "") || ""}
                  onChange={(e) => setActiveSlot((s) => ({ ...s, metaDescription: e.target.value }))}
                  placeholder="SEO meta description…"
                  style={{ width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">SEO Tags</label>
                <input
                  type="text"
                  value={(activeSlot.seoTags ?? "") || ""}
                  onChange={(e) => setActiveSlot((s) => ({ ...s, seoTags: e.target.value }))}
                  placeholder="Comma-separated SEO tags…"
                  style={{ width: "100%", fontSize: 13, padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}
                />
              </div>
            </div>

            {/* Right: Social with date/time + image gen */}
            <div>
              <div style={{ marginBottom: 16 }}>
                <span className="form-label">Social (3 days per tab)</span>
              </div>

              <div style={{ marginBottom: 16, padding: 12, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>Social Media Generation</div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                      Generate LinkedIn, Instagram, and X posts from this blog.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => generateSocialForSlot(activeSlot)}
                    disabled={activeSlot.topicId == null || generatingSlotId !== null || rateLimited}
                    title={rateLimited ? "Rate limited — wait 60s" : "Generate social posts from blog"}
                  >
                    {rateLimited ? "Rate limited — wait 60s" : "Generate Social Posts"}
                  </button>
                </div>
              </div>

              {/* LinkedIn — 3 variations, optional image */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--blue)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>LinkedIn</span>
                  3 variations
                </div>
                {safeSocialArray<SocialPost>(activeSlot.linkedin, []).map((p, i) => {
                  const approved = !p.excluded && isApproved("linkedin", p, getStoredImageUrl, activeSlot.topicId, i);
                  return (
                  <div key={i} className="social-card" style={{ display: "flex", flexDirection: "column", gap: 8, opacity: p.excluded ? 0.6 : 1 }}>
                    <div className="social-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        Variation {i + 1}
                        {approved && (
                          <span title="Ready to post" style={{ color: "var(--success, #22c55e)", display: "inline-flex", alignItems: "center" }}>
                            <Icon d={icons.check} size={14} strokeWidth={2.5} />
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 11, color: p.excluded ? "var(--accent)" : "var(--text3)" }}
                        onClick={() => {
                          pushUndoState();
                          setActiveSlot((s) => ({
                            ...s,
                            linkedin: s.linkedin.map((x, j) => (j === i ? { ...x, excluded: !x.excluded } : x)),
                          }));
                        }}
                        title={p.excluded ? "Include in post" : "Cancel / exclude from post"}
                      >
                        {p.excluded ? "Include" : <><Icon d={icons.x} size={12} /> Cancel</>}
                      </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 11 }}
                          onClick={() => setRegenerateModal({ open: true, scope: "linkedin", index: i })}
                          disabled={activeSlot.topicId == null || generatingSlotId !== null}
                          title="Regenerate this LinkedIn post"
                        >
                          <Icon d={icons.refresh} size={11} /> Regenerate
                        </button>
                        {activeSlot.topicId != null && (() => {
                          const posted = postedIndicesByTopicId[activeSlot.topicId]?.linkedin?.includes(i) ?? false;
                          const key = `li-${i}`;
                          const isPublishing = publishingSegment === key;
                          return posted ? (
                            <span style={{ fontSize: 11, color: "var(--success, #22c55e)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Icon d={icons.check} size={12} /> Posted
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ fontSize: 11, padding: "4px 8px" }}
                              disabled={isPublishing || p.excluded || !(p.text ?? "").trim()}
                              onClick={async () => {
                                if (activeSlot.topicId == null) return;
                                setPublishingSegment(key);
                                try {
                                  const res = await fetch("/api/publish-segment", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ topicId: activeSlot.topicId, platform: "linkedin", index: i }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error || "Publish failed");
                                  setToastMsg("LinkedIn post published.");
                                  setPostedIndicesByTopicId((prev) => ({
                                    ...prev,
                                    [activeSlot.topicId!]: {
                                      ...prev[activeSlot.topicId!],
                                      linkedin: [...(prev[activeSlot.topicId!]?.linkedin ?? []), i].sort((a, b) => a - b),
                                    },
                                  }));
                                } catch (e) {
                                  setToastMsg(e instanceof Error ? e.message : "Publish failed");
                                } finally {
                                  setPublishingSegment(null);
                                  setToast(true);
                                  setTimeout(() => setToast(false), 3000);
                                }
                              }}
                              title="Publish this LinkedIn post now (scheduler will skip it)"
                            >
                              {isPublishing ? "…" : <><Icon d={icons.send} size={11} /> Publish now</>}
                            </button>
                          );
                        })()}
                      </span>
                      <input
                        type="datetime-local"
                        value={p.datetime ?? ""}
                        onChange={(e) =>
                          setActiveSlot((s) => ({
                            ...s,
                            linkedin: s.linkedin.map((x, j) => (j === i ? { ...x, datetime: e.target.value } : x)),
                          }))
                        }
                        style={{ width: 180, fontSize: 11 }}
                      />
                    </div>
                    {activeSlot?.topicId != null && !removedImageKeys.has(`${activeSlot.topicId}-LINKEDIN-${i}`) && (p.imageUrl || generatedImageByKeyRef.current[`${activeSlot.topicId}-LINKEDIN-${i}`]) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <img
                          src={p.imageUrl || generatedImageByKeyRef.current[`${activeSlot.topicId}-LINKEDIN-${i}`] || ""}
                          alt=""
                          style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 6 }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 11, color: "var(--danger)" }}
                          onClick={() => handleRemoveLinkedInImage(i)}
                          title="Remove image from this post"
                        >
                          <Icon d={icons.trash} size={12} /> Remove image
                        </button>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <textarea
                        rows={5}
                        value={p.text ?? ""}
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          handleGenerateImageViaImagen("LINKEDIN", i);
                        }}
                        disabled={!!generatingImageFor}
                        style={{
                          padding: "6px 12px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--accent)",
                          background: "var(--accent-dim)",
                          border: "1px solid var(--accent-glow)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                        title="Generate image for this post (Imagen)"
                      >
                        {generatingImageFor === `li-${i}` ? "Generating…" : "✨ Generate Image"}
                      </button>
                    </div>
                    {activeSlot?.topicId != null && !removedImageKeys.has(`${activeSlot.topicId}-LINKEDIN-${i}`) && (p.imageUrl || generatedImageByKeyRef.current[`${activeSlot.topicId}-LINKEDIN-${i}`]) && (
                      <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                        <img
                          src={p.imageUrl || generatedImageByKeyRef.current[`${activeSlot.topicId}-LINKEDIN-${i}`] || ""}
                          alt=""
                          style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain", borderRadius: 6 }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 11, color: "var(--danger)" }}
                          onClick={() => handleRemoveLinkedInImage(i)}
                          title="Remove image"
                        >
                          <Icon d={icons.trash} size={12} /> Remove image
                        </button>
                      </div>
                    )}
                  </div>
                );
                })}
              </div>

              {/* Twitter — 6 posts */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text2)", marginBottom: 10 }}>
                  <span style={{ background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>𝕏 / Twitter</span>
                  {" "}6 posts
                </div>
                {safeSocialArray<SocialPost>(activeSlot.twitter, []).map((p, i) => {
                  const approved = !p.excluded && isApproved("twitter", p, getStoredImageUrl, activeSlot.topicId, i);
                  return (
                  <div key={i} className="social-card" style={{ opacity: p.excluded ? 0.6 : 1 }}>
                    <div className="social-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        Post {i + 1}
                        {approved && (
                          <span title="Ready to post" style={{ color: "var(--success, #22c55e)", display: "inline-flex", alignItems: "center" }}>
                            <Icon d={icons.check} size={14} strokeWidth={2.5} />
                          </span>
                        )}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 11, color: p.excluded ? "var(--accent)" : "var(--text3)" }}
                        onClick={() => {
                          pushUndoState();
                          setActiveSlot((s) => ({
                            ...s,
                            twitter: s.twitter.map((x, j) => (j === i ? { ...x, excluded: !x.excluded } : x)),
                          }));
                        }}
                        title={p.excluded ? "Include in post" : "Cancel / exclude from post"}
                      >
                        {p.excluded ? "Include" : <><Icon d={icons.x} size={12} /> Cancel</>}
                      </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 11 }}
                          onClick={() => setRegenerateModal({ open: true, scope: "twitter", index: i })}
                          disabled={activeSlot.topicId == null || generatingSlotId !== null}
                          title="Regenerate this Tweet"
                        >
                          <Icon d={icons.refresh} size={11} /> Regenerate
                        </button>
                        {activeSlot.topicId != null && (() => {
                          const posted = postedIndicesByTopicId[activeSlot.topicId]?.twitter?.includes(i) ?? false;
                          const key = `tw-${i}`;
                          const isPublishing = publishingSegment === key;
                          return posted ? (
                            <span style={{ fontSize: 11, color: "var(--success, #22c55e)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Icon d={icons.check} size={12} /> Posted
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ fontSize: 11, padding: "4px 8px" }}
                              disabled={isPublishing || p.excluded || !(p.text ?? "").trim()}
                              onClick={async () => {
                                if (activeSlot.topicId == null) return;
                                setPublishingSegment(key);
                                try {
                                  const res = await fetch("/api/publish-segment", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ topicId: activeSlot.topicId, platform: "twitter", index: i }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error || "Publish failed");
                                  setToastMsg("Tweet published.");
                                  setPostedIndicesByTopicId((prev) => ({
                                    ...prev,
                                    [activeSlot.topicId!]: {
                                      ...prev[activeSlot.topicId!],
                                      twitter: [...(prev[activeSlot.topicId!]?.twitter ?? []), i].sort((a, b) => a - b),
                                    },
                                  }));
                                } catch (e) {
                                  setToastMsg(e instanceof Error ? e.message : "Publish failed");
                                } finally {
                                  setPublishingSegment(null);
                                  setToast(true);
                                  setTimeout(() => setToast(false), 3000);
                                }
                              }}
                              title="Publish this tweet now (scheduler will skip it)"
                            >
                              {isPublishing ? "…" : <><Icon d={icons.send} size={11} /> Publish now</>}
                            </button>
                          );
                        })()}
                      </span>
                      <input
                        type="datetime-local"
                        value={p.datetime ?? ""}
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
                      rows={4}
                      value={(p.text ?? "") || ""}
                      placeholder="Tweet…"
                      onChange={(e) =>
                        setActiveSlot((s) => ({
                          ...s,
                          twitter: s.twitter.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                        }))
                      }
                    />
                    <span style={{ fontSize: 11, color: (p.text ?? "").length > 280 ? "var(--danger)" : "var(--text3)" }}>{(p.text ?? "").length}/280</span>
                  </div>
                );
                })}
              </div>

              {/* Instagram — 3 variations, required image */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent)", marginBottom: 10 }}>
                  <span style={{ background: "var(--accent-dim)", border: "1px solid var(--accent-glow)", borderRadius: 4, padding: "2px 8px", fontSize: 11 }}>Instagram</span>
                  {" "}3 variations (photo required)
                </div>
                {safeSocialArray<SocialPost>(activeSlot.instagram, []).map((p, i) => {
                  const igKey = activeSlot?.topicId != null ? `${activeSlot.topicId}-INSTAGRAM-${i}` : "";
                  const hasImg = !removedImageKeys.has(igKey) && !!(p.imageUrl ?? generatedImageByKeyRef.current[igKey]);
                  const approved = !p.excluded && isApproved("instagram", p, getStoredImageUrl, activeSlot.topicId, i);
                  return (
                  <div key={i} className="social-card" style={{ display: "flex", flexDirection: "column", gap: 8, opacity: p.excluded ? 0.6 : 1 }}>
                    <div className="social-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        Post {i + 1}
                        {approved && (
                          <span title="Ready to post (has image)" style={{ color: "var(--success, #22c55e)", display: "inline-flex", alignItems: "center" }}>
                            <Icon d={icons.check} size={14} strokeWidth={2.5} />
                          </span>
                        )}
                        {!p.excluded && (p.text ?? "").trim() && !hasImg && (
                          <span title="Image required to post" style={{ color: "var(--danger, #ef4444)", fontSize: 11 }}>⚠ Needs image</span>
                        )}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 11, color: p.excluded ? "var(--accent)" : "var(--text3)" }}
                        onClick={() => {
                          pushUndoState();
                          setActiveSlot((s) => ({
                            ...s,
                            instagram: s.instagram.map((x, j) => (j === i ? { ...x, excluded: !x.excluded } : x)),
                          }));
                        }}
                        title={p.excluded ? "Include in post" : "Cancel / exclude from post"}
                      >
                        {p.excluded ? "Include" : <><Icon d={icons.x} size={12} /> Cancel</>}
                      </button>
                      <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 11 }}
                          onClick={() => setRegenerateModal({ open: true, scope: "instagram", index: i })}
                          disabled={activeSlot.topicId == null || generatingSlotId !== null}
                          title="Regenerate this Instagram caption"
                        >
                          <Icon d={icons.refresh} size={11} /> Regenerate
                        </button>
                        {activeSlot.topicId != null && (() => {
                          const posted = postedIndicesByTopicId[activeSlot.topicId]?.instagram?.includes(i) ?? false;
                          const key = `ig-${i}`;
                          const isPublishing = publishingSegment === key;
                          return posted ? (
                            <span style={{ fontSize: 11, color: "var(--success, #22c55e)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <Icon d={icons.check} size={12} /> Posted
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ fontSize: 11, padding: "4px 8px" }}
                              disabled={isPublishing || p.excluded || !(p.text ?? "").trim() || !hasImg}
                              onClick={async () => {
                                if (activeSlot.topicId == null) return;
                                setPublishingSegment(key);
                                try {
                                  // #region agent log
                                  fetch("http://127.0.0.1:7822/ingest/d299f8e8-acc9-48de-a2c7-afb2bceab8c9", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "584c98" },
                                    body: JSON.stringify({
                                      sessionId: "584c98",
                                      runId: "debug-pre",
                                      hypothesisId: "H2",
                                      location: "app/review/page.tsx:instagram:PublishNow",
                                      message: "Publish Now clicked (instagram segment)",
                                      data: { topicId: activeSlot.topicId, platform: "instagram", index: i },
                                      timestamp: Date.now(),
                                    }),
                                  }).catch(() => {});
                                  // #endregion

                                  const res = await fetch("/api/publish-segment", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      topicId: activeSlot.topicId,
                                      platform: "instagram",
                                      index: i,
                                      caption: (p.text ?? "").trim(),
                                      imageUrl: (p.imageUrl || generatedImageByKeyRef.current[igKey] || "").trim(),
                                    }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error || "Publish failed");
                                  setToastMsg("Instagram post published.");
                                  setPostedIndicesByTopicId((prev) => ({
                                    ...prev,
                                    [activeSlot.topicId!]: {
                                      ...prev[activeSlot.topicId!],
                                      instagram: [...(prev[activeSlot.topicId!]?.instagram ?? []), i].sort((a, b) => a - b),
                                    },
                                  }));
                                } catch (e) {
                                  setToastMsg(e instanceof Error ? e.message : "Publish failed");
                                } finally {
                                  setPublishingSegment(null);
                                  setToast(true);
                                  setTimeout(() => setToast(false), 3000);
                                }
                              }}
                              title="Publish this Instagram post now (scheduler will skip it). Requires image."
                            >
                              {isPublishing ? "…" : <><Icon d={icons.send} size={11} /> Publish now</>}
                            </button>
                          );
                        })()}
                      </span>
                      <input
                        type="datetime-local"
                        value={p.datetime ?? ""}
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
                        onClick={activeSlot?.topicId != null && (removedImageKeys.has(igKey) || !(p.imageUrl || generatedImageByKeyRef.current[igKey])) ? () => handleGenerateInstagramImage(i) : undefined}
                        style={{ width: 100, height: 100, flexShrink: 0 }}
                      >
                        {activeSlot?.topicId != null && !removedImageKeys.has(igKey) && (p.imageUrl || generatedImageByKeyRef.current[igKey]) ? (
                          <img
                            src={p.imageUrl || generatedImageByKeyRef.current[igKey] || ""}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 6 }}
                          />
                        ) : (
                          <span style={{ fontSize: 10 }}>{generatingImageFor === `ig-${i}` ? "Generating…" : "Generate photo"}</span>
                        )}
                      </div>
                      {activeSlot?.topicId != null && !removedImageKeys.has(igKey) && (p.imageUrl || generatedImageByKeyRef.current[igKey]) && (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: 11 }}
                            onClick={() => handleGenerateInstagramImage(i)}
                            disabled={!!generatingImageFor}
                            title="Regenerate image"
                          >
                            Regenerate
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ fontSize: 11, color: "var(--danger)" }}
                            onClick={() => handleRemoveInstagramImage(i)}
                            title="Remove image"
                          >
                            <Icon d={icons.trash} size={12} /> Remove image
                          </button>
                        </>
                      )}
                      <textarea
                        rows={5}
                        value={(p.text ?? "") || ""}
                        placeholder="Caption…"
                        onChange={(e) =>
                          setActiveSlot((s) => ({
                            ...s,
                            instagram: s.instagram.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                          }))
                        }
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          handleGenerateImageViaImagen("INSTAGRAM", i);
                        }}
                        disabled={!!generatingImageFor}
                        style={{
                          padding: "6px 12px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--accent)",
                          background: "var(--accent-dim)",
                          border: "1px solid var(--accent-glow)",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                        title="Generate image for this post (Imagen)"
                      >
                        {generatingImageFor === `ig-${i}` ? "Generating…" : "✨ Generate Image"}
                      </button>
                    </div>
                    {activeSlot?.topicId != null && !removedImageKeys.has(igKey) && (p.imageUrl || generatedImageByKeyRef.current[igKey]) && (
                      <div style={{ marginTop: 8, display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                        <img
                          src={p.imageUrl || generatedImageByKeyRef.current[igKey] || ""}
                          alt=""
                          style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 6 }}
                        />
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ fontSize: 11, color: "var(--danger)" }}
                          onClick={() => handleRemoveInstagramImage(i)}
                          title="Remove image"
                        >
                          <Icon d={icons.trash} size={12} /> Remove image
                        </button>
                      </div>
                    )}
                  </div>
                );
                })}
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

      {toast && <Toast msg={toastMsg || "Saved / Tabs updated"} />}

      <RegenerateContextModal
        open={regenerateModal.open}
        onClose={() => setRegenerateModal({ open: false, scope: "blog" })}
        onConfirm={handleRegeneratePiece}
        title={
          regenerateModal.scope === "blog"
            ? "Regenerate Blog"
            : regenerateModal.scope === "linkedin"
              ? "Regenerate LinkedIn Post"
              : regenerateModal.scope === "twitter"
                ? "Regenerate Tweet"
                : "Regenerate Instagram Caption"
        }
        description={
          regenerateModal.scope === "blog"
            ? "Provide additional context to guide the blog regeneration. What would you like to change?"
            : "Provide additional context for this social post. What tone, angle, or changes do you want?"
        }
        placeholder="e.g. Make it more conversational, add a stronger CTA, focus on benefits…"
        isLoading={generatingSlotId === activeSlot?.id}
      />
    </div>
  );
}
