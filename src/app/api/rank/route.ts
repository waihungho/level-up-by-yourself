import { NextResponse } from "next/server";
import { buildRankings } from "@/lib/rankings";

/*
 * Rankings are computed in Postgres (levelup_rankings) and cached at the CDN: fresh for
 * 2 minutes, then served stale for up to a day while the CDN refreshes in the background,
 * so a visitor practically never waits on a recompute even with low traffic.
 */
export async function GET() {
  try {
    const rankings = await buildRankings();
    return NextResponse.json(rankings, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=86400" },
    });
  } catch (e) {
    console.error("[rank GET]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
