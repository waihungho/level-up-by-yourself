import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { endSession, startSession } from "@/lib/life/life-service";

/** Starts a focus or meditation session. */
export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof startSession>[0]>(req);
  if (!body) return missingFields();
  return respond("life/session POST", () => startSession(body));
}

/** Finishes (or, with `cancel: true`, abandons) the open session. */
export async function PATCH(req: NextRequest) {
  const body = await readJson<Parameters<typeof endSession>[0]>(req);
  if (!body) return missingFields();
  return respond("life/session PATCH", () => endSession(body));
}
