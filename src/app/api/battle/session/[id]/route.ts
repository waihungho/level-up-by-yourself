import { NextRequest, NextResponse } from "next/server";
import { getSessionView } from "@/lib/tactical/battle-service";
import { getSessionStore } from "@/lib/tactical/session-store";
import { defaultRng } from "@/lib/tactical/rng";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  try {
    const result = await getSessionView({ sessionId: id, walletAddress: wallet }, { store: getSessionStore(), rng: defaultRng });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error("[battle/session]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
