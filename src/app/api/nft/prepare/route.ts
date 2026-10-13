import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { prepareMint } from "@/lib/nft/mint-service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof prepareMint>[0]>(req);
  if (!body) return missingFields();
  // Vercel sets x-real-ip / x-forwarded-for; the leftmost forwarded entry is the client.
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  return respond("nft/prepare", () => prepareMint(body, ip));
}
