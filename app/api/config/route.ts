import { NextResponse } from "next/server";
import { getDb, useTurso } from "@/lib/db";
import { readConfig, writeConfig } from "@/lib/config-store";

const CONFIG_ID = 1;

type ConfigRow = {
  brand_voice: string | null;
  linkedin_persona: string | null;
  instagram_persona: string | null;
  twitter_persona: string | null;
  value_props: string | null;
  image_style: string | null;
  image_negative_prompts: string | null;
  primary_hex: string | null;
  secondary_hex: string | null;
} | undefined;

export async function GET() {
  try {
    if (useTurso()) {
      try {
        const db = await getDb();
        const raw = await db
          .prepare(
            "SELECT brand_voice, linkedin_persona, instagram_persona, twitter_persona, value_props, image_style, image_negative_prompts, primary_hex, secondary_hex, blog_visual_prompts, linkedin_visual_prompts, twitter_visual_prompts, instagram_visual_prompts FROM Config WHERE id = ?"
          )
          .get(CONFIG_ID);
        const row = raw as unknown as ConfigRow;

        if (
          row === undefined ||
          row === null ||
          typeof (row as Record<string, unknown>)?.brand_voice === "undefined"
        ) {
          return NextResponse.json(
            { message: "Configuration not found" },
            { status: 404 }
          );
        }

        let blogVisual: string[] = [];
        let linkedinVisual: string[] = [];
        let twitterVisual: string[] = [];
        let instagramVisual: string[] = [];
        try {
          const rowAny = row as Record<string, string | undefined>;
          blogVisual = rowAny.blog_visual_prompts ? JSON.parse(rowAny.blog_visual_prompts) : [];
          linkedinVisual = rowAny.linkedin_visual_prompts ? JSON.parse(rowAny.linkedin_visual_prompts) : [];
          twitterVisual = rowAny.twitter_visual_prompts ? JSON.parse(rowAny.twitter_visual_prompts) : [];
          instagramVisual = rowAny.instagram_visual_prompts ? JSON.parse(rowAny.instagram_visual_prompts) : [];
        } catch {
          /* use empty */
        }
        return NextResponse.json({
          brand_voice: row.brand_voice ?? "",
          linkedin_persona: row.linkedin_persona ?? "",
          instagram_persona: row.instagram_persona ?? "",
          twitter_persona: row.twitter_persona ?? "",
          value_props: row.value_props ? JSON.parse(row.value_props) : [],
          image_style: row.image_style ?? "",
          image_negative_prompts: row.image_negative_prompts ?? "",
          primary_hex: row.primary_hex ?? "#6ee7b7",
          secondary_hex: row.secondary_hex ?? "#60a5fa",
          blog_visual_prompts: Array.isArray(blogVisual) ? blogVisual : [],
          linkedin_visual_prompts: Array.isArray(linkedinVisual) ? linkedinVisual : [],
          twitter_visual_prompts: Array.isArray(twitterVisual) ? twitterVisual : [],
          instagram_visual_prompts: Array.isArray(instagramVisual) ? instagramVisual : [],
        });
      } catch {
        return NextResponse.json(
          { message: "Configuration not found" },
          { status: 404 }
        );
      }
    }

    const fileConfig = readConfig();
    if (fileConfig) {
      let blogVisual: string[] = [];
      let linkedinVisual: string[] = [];
      let twitterVisual: string[] = [];
      let instagramVisual: string[] = [];
      try {
        blogVisual = fileConfig.blog_visual_prompts ? JSON.parse(fileConfig.blog_visual_prompts) : [];
        linkedinVisual = fileConfig.linkedin_visual_prompts ? JSON.parse(fileConfig.linkedin_visual_prompts) : [];
        twitterVisual = fileConfig.twitter_visual_prompts ? JSON.parse(fileConfig.twitter_visual_prompts) : [];
        instagramVisual = fileConfig.instagram_visual_prompts ? JSON.parse(fileConfig.instagram_visual_prompts) : [];
      } catch {
        /* use empty */
      }
      return NextResponse.json({
        brand_voice: fileConfig.brand_voice,
        linkedin_persona: fileConfig.linkedin_persona,
        instagram_persona: fileConfig.instagram_persona,
        twitter_persona: fileConfig.twitter_persona,
        value_props: fileConfig.value_props ? JSON.parse(fileConfig.value_props) : [],
        image_style: fileConfig.image_style,
        image_negative_prompts: fileConfig.image_negative_prompts ?? "",
        primary_hex: fileConfig.primary_hex,
        secondary_hex: fileConfig.secondary_hex,
        blog_visual_prompts: Array.isArray(blogVisual) ? blogVisual : [],
        linkedin_visual_prompts: Array.isArray(linkedinVisual) ? linkedinVisual : [],
        twitter_visual_prompts: Array.isArray(twitterVisual) ? twitterVisual : [],
        instagram_visual_prompts: Array.isArray(instagramVisual) ? instagramVisual : [],
      });
    }

    const db = await getDb();
    try {
      const raw = await db
        .prepare(
          "SELECT brand_voice, linkedin_persona, instagram_persona, twitter_persona, value_props, image_style, image_negative_prompts, primary_hex, secondary_hex, blog_visual_prompts, linkedin_visual_prompts, twitter_visual_prompts, instagram_visual_prompts FROM Config WHERE id = ?"
        )
        .get(CONFIG_ID);
      const row = raw as unknown as ConfigRow;

      if (
        row === undefined ||
        row === null ||
        typeof (row as Record<string, unknown>).brand_voice === "undefined"
      ) {
        return NextResponse.json(
          { message: "Configuration not found" },
          { status: 404 }
        );
      }

      let blogVisual: string[] = [];
      let linkedinVisual: string[] = [];
      let twitterVisual: string[] = [];
      let instagramVisual: string[] = [];
      try {
        const rowAny = row as Record<string, string | undefined>;
        blogVisual = rowAny.blog_visual_prompts ? JSON.parse(rowAny.blog_visual_prompts) : [];
        linkedinVisual = rowAny.linkedin_visual_prompts ? JSON.parse(rowAny.linkedin_visual_prompts) : [];
        twitterVisual = rowAny.twitter_visual_prompts ? JSON.parse(rowAny.twitter_visual_prompts) : [];
        instagramVisual = rowAny.instagram_visual_prompts ? JSON.parse(rowAny.instagram_visual_prompts) : [];
      } catch {
        /* use empty */
      }
      return NextResponse.json({
        brand_voice: row.brand_voice ?? "",
        linkedin_persona: row.linkedin_persona ?? "",
        instagram_persona: row.instagram_persona ?? "",
        twitter_persona: row.twitter_persona ?? "",
        value_props: row.value_props ? JSON.parse(row.value_props) : [],
        image_style: row.image_style ?? "",
        image_negative_prompts: row.image_negative_prompts ?? "",
        primary_hex: row.primary_hex ?? "#6ee7b7",
        secondary_hex: row.secondary_hex ?? "#60a5fa",
        blog_visual_prompts: Array.isArray(blogVisual) ? blogVisual : [],
        linkedin_visual_prompts: Array.isArray(linkedinVisual) ? linkedinVisual : [],
        twitter_visual_prompts: Array.isArray(twitterVisual) ? twitterVisual : [],
        instagram_visual_prompts: Array.isArray(instagramVisual) ? instagramVisual : [],
      });
    } catch {
      return NextResponse.json(
        { message: "Configuration not found" },
        { status: 404 }
      );
    }
  } catch (e) {
    console.error("GET /api/config", e);
    return NextResponse.json(
      { error: "Failed to load config" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const brand_voice =
      typeof body.brand_voice === "string" ? body.brand_voice : "";
    const linkedin_persona =
      typeof body.linkedin_persona === "string" ? body.linkedin_persona : "";
    const instagram_persona =
      typeof body.instagram_persona === "string" ? body.instagram_persona : "";
    const twitter_persona =
      typeof body.twitter_persona === "string" ? body.twitter_persona : "";
    const value_props = Array.isArray(body.value_props)
      ? JSON.stringify(body.value_props)
      : typeof body.value_props === "string"
        ? body.value_props
        : "[]";
    const image_style =
      typeof body.image_style === "string" ? body.image_style : "";
    const image_negative_prompts =
      typeof body.image_negative_prompts === "string" ? body.image_negative_prompts : "";
    const primary_hex =
      typeof body.primary_hex === "string" ? body.primary_hex : "#6ee7b7";
    const secondary_hex =
      typeof body.secondary_hex === "string" ? body.secondary_hex : "#60a5fa";
    const blog_visual_prompts = Array.isArray(body.blog_visual_prompts)
      ? JSON.stringify(body.blog_visual_prompts.filter((x: unknown) => typeof x === "string").slice(0, 5))
      : typeof body.blog_visual_prompts === "string"
        ? body.blog_visual_prompts
        : "[]";
    const linkedin_visual_prompts = Array.isArray(body.linkedin_visual_prompts)
      ? JSON.stringify(body.linkedin_visual_prompts.filter((x: unknown) => typeof x === "string").slice(0, 3))
      : typeof body.linkedin_visual_prompts === "string"
        ? body.linkedin_visual_prompts
        : "[]";
    const twitter_visual_prompts = Array.isArray(body.twitter_visual_prompts)
      ? JSON.stringify(body.twitter_visual_prompts.filter((x: unknown) => typeof x === "string").slice(0, 3))
      : typeof body.twitter_visual_prompts === "string"
        ? body.twitter_visual_prompts
        : "[]";
    const instagram_visual_prompts = Array.isArray(body.instagram_visual_prompts)
      ? JSON.stringify(body.instagram_visual_prompts.filter((x: unknown) => typeof x === "string").slice(0, 3))
      : typeof body.instagram_visual_prompts === "string"
        ? body.instagram_visual_prompts
        : "[]";

    writeConfig({
      brand_voice,
      linkedin_persona,
      instagram_persona,
      twitter_persona,
      value_props,
      image_style,
      image_negative_prompts,
      primary_hex,
      secondary_hex,
      blog_visual_prompts,
      linkedin_visual_prompts,
      twitter_visual_prompts,
      instagram_visual_prompts,
    });

    if (useTurso()) {
      try {
        const db = await getDb();
        await db.prepare(
        `INSERT INTO Config (id, brand_voice, linkedin_persona, instagram_persona, twitter_persona, value_props, image_style, image_negative_prompts, primary_hex, secondary_hex, blog_visual_prompts, linkedin_visual_prompts, twitter_visual_prompts, instagram_visual_prompts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           brand_voice = excluded.brand_voice,
           linkedin_persona = excluded.linkedin_persona,
           instagram_persona = excluded.instagram_persona,
           twitter_persona = excluded.twitter_persona,
           value_props = excluded.value_props,
           image_style = excluded.image_style,
           image_negative_prompts = excluded.image_negative_prompts,
           primary_hex = excluded.primary_hex,
           secondary_hex = excluded.secondary_hex,
           blog_visual_prompts = excluded.blog_visual_prompts,
           linkedin_visual_prompts = excluded.linkedin_visual_prompts,
           twitter_visual_prompts = excluded.twitter_visual_prompts,
           instagram_visual_prompts = excluded.instagram_visual_prompts`
        ).run(CONFIG_ID, brand_voice, linkedin_persona, instagram_persona, twitter_persona, value_props, image_style, image_negative_prompts, primary_hex, secondary_hex, blog_visual_prompts, linkedin_visual_prompts, twitter_visual_prompts, instagram_visual_prompts);
      } catch {
        // Config may not exist yet - INSERT without ON CONFLICT
        try {
          const db = await getDb();
          await db.prepare(
            `INSERT OR REPLACE INTO Config (id, brand_voice, linkedin_persona, instagram_persona, twitter_persona, value_props, image_style, image_negative_prompts, primary_hex, secondary_hex, blog_visual_prompts, linkedin_visual_prompts, twitter_visual_prompts, instagram_visual_prompts)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(CONFIG_ID, brand_voice, linkedin_persona, instagram_persona, twitter_persona, value_props, image_style, image_negative_prompts, primary_hex, secondary_hex, blog_visual_prompts, linkedin_visual_prompts, twitter_visual_prompts, instagram_visual_prompts);
        } catch {
          /* ignore */
        }
      }
    } else {
      // File store fallback
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/config", e);
    return NextResponse.json(
      { error: "Failed to save config" },
      { status: 500 }
    );
  }
}
