import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { summon } from "@/lib/summon-service";
import { verifySolPayment } from "@/lib/verify-payment";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof summon>[0]>(req);
  if (!body) return missingFields();
  return respond("summon", () => summon(body, { verify: verifySolPayment }));
}
