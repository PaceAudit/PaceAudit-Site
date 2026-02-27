import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const CONFIG_ID = 1;

export async function GET() {
  try {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT brand_voice, value_props, image_style, primary_hex, secondary_hex FROM Config WHERE id = ?"
      )
      .get(CONFIG_ID) as
      | {
          brand_voice: string | null;
          value_props: string | null;
          image_style: string | null;
          primary_hex: string | null;
          secondary_hex: string | null;
        }
      | undefined;

    if (!row) {
      return NextResponse.json(null);
    }

    return NextResponse.json({
      brand_voice: row.brand_voice ?? "",
      value_props: row.value_props ? JSON.parse(row.value_props) : [],
      image_style: row.image_style ?? "",
      primary_hex: row.primary_hex ?? "#6ee7b7",
      secondary_hex: row.secondary_hex ?? "#60a5fa",
    });
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
    const value_props = Array.isArray(body.value_props)
      ? JSON.stringify(body.value_props)
      : typeof body.value_props === "string"
        ? body.value_props
        : "[]";
    const image_style =
      typeof body.image_style === "string" ? body.image_style : "";
    const primary_hex =
      typeof body.primary_hex === "string" ? body.primary_hex : "#6ee7b7";
    const secondary_hex =
      typeof body.secondary_hex === "string" ? body.secondary_hex : "#60a5fa";

    const db = getDb();
    db.prepare(
      `INSERT INTO Config (id, brand_voice, value_props, image_style, primary_hex, secondary_hex)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         brand_voice = excluded.brand_voice,
         value_props = excluded.value_props,
         image_style = excluded.image_style,
         primary_hex = excluded.primary_hex,
         secondary_hex = excluded.secondary_hex`
    ).run(CONFIG_ID, brand_voice, value_props, image_style, primary_hex, secondary_hex);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/config", e);
    return NextResponse.json(
      { error: "Failed to save config" },
      { status: 500 }
    );
  }
}
