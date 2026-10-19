import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { claimPass } from "@/lib/pass/pass-service";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return missingFields();
  return respond("pass/claim", () => claimPass({ walletAddress: body.walletAddress, tier: body.tier, track: body.track, all: body.all }));
}
