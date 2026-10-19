import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { checkIn } from "@/lib/pass/pass-service";

export async function POST(req: NextRequest) {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return missingFields();
  return respond("pass/checkin", () => checkIn({ walletAddress: body.walletAddress }));
}
