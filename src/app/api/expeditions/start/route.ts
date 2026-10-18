import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { startExpedition } from "@/lib/expeditions/expedition-service";

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof startExpedition>[0]>(req);
  if (!body) return missingFields();
  return respond("expeditions/start", () => startExpedition(body));
}
