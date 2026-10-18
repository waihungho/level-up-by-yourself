import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { claimExpedition } from "@/lib/expeditions/expedition-service";

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof claimExpedition>[0]>(req);
  if (!body) return missingFields();
  return respond("expeditions/claim", () => claimExpedition(body));
}
