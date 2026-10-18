/*
 * Solana Actions plumbing for Blink challenges: spec types (the subset we use, from
 * @solana/actions-spec 2.4), response headers and the memo. No server imports.
 * Spec: https://solana.com/docs/advanced/actions
 */
import { NextResponse } from "next/server";

/** Spec version we implement, sent as X-Action-Version. */
export const ACTIONS_SPEC_VERSION = "2.4";
/** CAIP-2 id of Solana mainnet, sent as X-Blockchain-Ids. */
export const SOLANA_MAINNET_CHAIN_ID = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/** CORS + spec headers required on every Actions response (including OPTIONS and actions.json). */
export const ACTION_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
  "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
  "X-Action-Version": ACTIONS_SPEC_VERSION,
  "X-Blockchain-Ids": SOLANA_MAINNET_CHAIN_ID,
};

/** Memo the challenger's transaction must carry, so one signature can't be used for another agent. */
export function blinkMemo(agentId: string): string {
  return `levelup:blink:${agentId}`;
}

export interface LinkedAction {
  type: "transaction" | "message" | "post" | "external-link";
  href: string;
  label: string;
}

/** GET response (`type: "action"`) and the terminal `type: "completed"` action of a chain. */
export interface ActionGetResponse {
  type: "action" | "completed";
  icon: string;
  title: string;
  description: string;
  label: string;
  disabled?: boolean;
  links?: { actions: LinkedAction[] };
  error?: { message: string };
}

/** POST response for a transaction, chained to a callback that receives `{ account, signature }`. */
export interface ActionTransactionResponse {
  type: "transaction";
  transaction: string;
  message?: string;
  links?: { next: { type: "post"; href: string } };
}

export function actionJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: ACTION_HEADERS });
}

/** Preflight answer for every Actions route (200 + headers, like the official examples). */
export function actionOptions(): NextResponse {
  return NextResponse.json(null, { headers: ACTION_HEADERS });
}

/** Runs a service call and maps its result (or an unexpected error) to an Actions JSON response. */
export async function respondAction(tag: string, run: () => Promise<{ status: number; body: Record<string, unknown> }>): Promise<NextResponse> {
  try {
    const result = await run();
    return actionJson(result.body, result.status);
  } catch (e) {
    console.error(`[${tag}]`, e);
    return actionJson({ error: "internal", message: "Something went wrong. Try again." }, 500);
  }
}

/** Parses an Actions POST body; {} when it is missing or malformed (the service reports missing fields). */
export async function readActionBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
