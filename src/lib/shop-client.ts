/** Random id that makes a shop purchase idempotent across retries and double taps. */
export function newPurchaseId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "");
  // Older Android WebViews (< Chrome 92) lack randomUUID.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const SHOP_ERRORS: Record<string, string> = {
  insufficient_gems: "Not enough gems. Top up with a gem pack.",
  already_owned: "You already have that title.",
  not_owner: "That agent isn't yours.",
  invalid_item: "That item isn't available.",
  nothing_to_refill: "This agent hasn't used any training fights today.",
  network: "Network error. Please try again.",
};

const RETRY_ATTEMPTS = 3;

/**
 * POSTs JSON, retrying only when the request never got a response (network error).
 * The body (and its purchaseId) is identical on every attempt, so the server applies it at most once.
 */
export async function postJson(url: string, body: unknown, retryDelayMs = 1500): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { ok: res.ok, status: res.status, data: await res.json() };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export const GEM_BALANCE_EVENT = "levelup:gem-balance";

/** Tells every gem display on the page (chips, shop header) about a new balance. */
export function announceGemBalance(balance: number): void {
  window.dispatchEvent(new CustomEvent<number>(GEM_BALANCE_EVENT, { detail: balance }));
}
