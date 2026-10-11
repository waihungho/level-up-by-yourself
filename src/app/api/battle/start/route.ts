import type { NextRequest } from "next/server";
import { missingFields, readJson, respond, serviceDeps } from "@/lib/api-route";
import { startBattle } from "@/lib/tactical/battle-service";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof startBattle>[0]>(req);
  if (!body) return missingFields();
  return respond("battle/start", () => startBattle(body, serviceDeps()));
}
