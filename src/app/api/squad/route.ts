import { NextRequest, NextResponse } from "next/server";
import { getSquadView, putSquad } from "@/lib/tactical/squad-service";

export async function GET(req: NextRequest) {
  try {
    const result = await getSquadView({ walletAddress: req.nextUrl.searchParams.get("wallet") ?? undefined });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error("[squad GET]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: { walletAddress?: string; agentIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  try {
    const result = await putSquad(body ?? {});
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error("[squad PUT]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
