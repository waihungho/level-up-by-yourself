import { NextRequest, NextResponse } from "next/server";
import { getRaidView } from "@/lib/raid/raid-service";

export async function GET(req: NextRequest) {
  try {
    const result = await getRaidView({ walletAddress: req.nextUrl.searchParams.get("wallet") ?? undefined });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error("[raid GET]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
