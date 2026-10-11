/** Random id that makes a shop purchase idempotent across retries and double taps. */
export function newPurchaseId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export const SHOP_ERRORS: Record<string, string> = {
  insufficient_gems: "Not enough gems. Top up with a gem pack.",
  already_owned: "You already have that title.",
  not_owner: "That agent isn't yours.",
  invalid_item: "That item isn't available.",
  network: "Network error. Please try again.",
};
