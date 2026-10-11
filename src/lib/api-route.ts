import { after, NextResponse, type NextRequest } from "next/server";
import { getSessionStore } from "@/lib/tactical/session-store";
import { defaultRng } from "@/lib/tactical/rng";
import type { ServiceDeps, ServiceResult } from "@/lib/tactical/service-common";

/** Production service dependencies: Supabase-backed sessions, Math.random, slow work after the response. */
export function serviceDeps(): ServiceDeps {
  return { store: getSessionStore(), rng: defaultRng, defer: (task) => after(task) };
}

/** Runs a service call and maps its result (or an unexpected error) to a JSON response. */
export async function respond(tag: string, run: () => Promise<ServiceResult>): Promise<NextResponse> {
  try {
    const result = await run();
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    console.error(`[${tag}]`, e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

/** Parses a JSON body; null when it is missing or malformed. */
export async function readJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return ((await req.json()) ?? {}) as T;
  } catch {
    return null;
  }
}

export const missingFields = () => NextResponse.json({ error: "missing_fields" }, { status: 400 });
