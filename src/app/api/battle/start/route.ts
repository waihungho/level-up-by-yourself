import { NextRequest, NextResponse } from "next/server";
import { startBattle } from "@/lib/tactical/battle-service";
import { getSessionStore } from "@/lib/tactical/session-store";
import { defaultRng } from "@/lib/tactical/rng";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  try {
    const result = await startBattle((body ?? {}) as Parameters<typeof startBattle>[0], { store: getSessionStore(), rng: defaultRng });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error("[battle/start]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
