import { CYCLE } from "./constants";
import type { Action, Category } from "./types";

/** Validates a tactical action payload from the client. */
export function parseAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as { type?: unknown; category?: unknown };
  if (a.type === "guard" || a.type === "special" || a.type === "auto") return { type: a.type };
  if (a.type === "strike" && CYCLE.includes(a.category as Category)) {
    return { type: "strike", category: a.category as Category };
  }
  return null;
}
