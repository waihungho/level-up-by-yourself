import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { prepareMint } from "@/lib/nft/mint-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof prepareMint>[0]>(req);
  if (!body) return missingFields();
  return respond("nft/prepare", () => prepareMint(body));
}
