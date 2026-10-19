/*
 * Solana Actions plumbing for Blink challenges: spec types (the subset we use, from
 * @solana/actions-spec 2.4) and response helpers.
 * Spec: https://solana.com/docs/advanced/actions
 */
import { NextResponse } from "next/server";
import { blinkChainId } from "./cluster";

/** Spec version we implement, sent as X-Action-Version. */
export const ACTIONS_SPEC_VERSION = "2.4";

/** CORS + spec headers required on every Actions response (including OPTIONS and actions.json). */
export function actionHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Content-Encoding, Accept-Encoding, X-Accept-Action-Version, X-Accept-Blockchain-Ids",
    "Access-Control-Expose-Headers": "X-Action-Version, X-Blockchain-Ids",
    "X-Action-Version": ACTIONS_SPEC_VERSION,
    "X-Blockchain-Ids": blinkChainId(),
  };
}

export type LinkedAction = {
  type: "transaction" | "message" | "post" | "external-link";
  href: string;
  label: string;
};

/** GET response (`type: "action"`) and the terminal `type: "completed"` action of a chain. */
export type ActionGetResponse = {
  type: "action" | "completed";
  icon: string;
  title: string;
  description: string;
  label: string;
  disabled?: boolean;
  links?: { actions: LinkedAction[] };
  error?: { message: string };
};

/** POST response for a transaction, chained to a callback that receives `{ account, signature }`. */
export type ActionTransactionResponse = {
  type: "transaction";
  transaction: string;
  message?: string;
  links?: { next: { type: "post"; href: string } };
};

/** Error body: `message` is the spec's ActionError text Blink clients show, `error` our usual code. */
export type ActionErrorBody = { error: string; message: string };

export type ActionResult = { status: number; body: ActionGetResponse | ActionTransactionResponse | ActionErrorBody };

export function actionOk(body: ActionGetResponse | ActionTransactionResponse): ActionResult {
  return { status: 200, body };
}

export function actionFail(status: number, error: string, message: string): ActionResult {
  return { status, body: { error, message } };
}

export function actionJson(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...actionHeaders(), ...extraHeaders } });
}

/** Preflight answer for every Actions route (200 + headers, like the official examples). */
export function actionOptions(): NextResponse {
  return actionJson(null);
}

/** Runs a service call and maps its result (or an unexpected error) to an Actions JSON response. */
export async function respondAction(tag: string, run: () => Promise<ActionResult>, okHeaders: Record<string, string> = {}): Promise<NextResponse> {
  try {
    const result = await run();
    return actionJson(result.body, result.status, result.status === 200 ? okHeaders : {});
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

export function isActionError(body: ActionResult["body"]): body is ActionErrorBody {
  return typeof (body as ActionErrorBody).error === "string";
}
