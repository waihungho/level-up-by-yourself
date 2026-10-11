import type { NextRequest } from "next/server";
import { missingFields, readJson, respond, serviceDeps } from "@/lib/api-route";
import { takeTurn } from "@/lib/tactical/battle-service";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof takeTurn>[0]>(req);
  if (!body) return missingFields();
  return respond("battle/turn", () => takeTurn(body, serviceDeps()));
}
