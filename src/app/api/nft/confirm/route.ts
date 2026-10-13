import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { confirmMint } from "@/lib/nft/mint-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof confirmMint>[0]>(req);
  if (!body) return missingFields();
  return respond("nft/confirm", () => confirmMint(body));
}
