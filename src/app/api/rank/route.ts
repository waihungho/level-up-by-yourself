import { NextResponse } from "next/server";
import { buildRankings } from "@/lib/rankings";

/*
 * Rankings read every agent dimension row (55k+), so they are computed here once
 * and cached at the CDN instead of being paged into each browser.
 */
export async function GET() {
  try {
    const rankings = await buildRankings();
    return NextResponse.json(rankings, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (e) {
    console.error("[rank GET]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
