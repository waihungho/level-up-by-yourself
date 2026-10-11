import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { getSquadView, putSquad } from "@/lib/tactical/squad-service";

export async function GET(req: NextRequest) {
  return respond("squad GET", () => getSquadView({ walletAddress: req.nextUrl.searchParams.get("wallet") ?? undefined }));
}

export async function PUT(req: NextRequest) {
  const body = await readJson<{ walletAddress?: string; agentIds?: unknown }>(req);
  if (!body) return missingFields();
  return respond("squad PUT", () => putSquad(body));
}
