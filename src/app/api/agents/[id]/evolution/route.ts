import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { evolveAgent, getEvolution } from "@/lib/evolution-service";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return respond("evolution GET", () => getEvolution(id));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readJson<{ walletAddress?: unknown; path?: unknown }>(req);
  if (!body) return missingFields();
  return respond("evolution POST", () => evolveAgent({ ...body, agentId: id }));
}
