import { utcToday } from "@/lib/time";

/* Client-side daily check-in: at most one request per UTC day per wallet on this device. */

const KEY_PREFIX = "levelup:pass-checkin:";

/** POSTs /api/pass/checkin once per UTC day per wallet. Never throws; the server is idempotent anyway. */
export async function checkInOncePerDay(wallet: string): Promise<void> {
  const today = utcToday();
  const key = KEY_PREFIX + wallet;
  try {
    if (localStorage.getItem(key) === today) return;
  } catch {
    // storage blocked: fall through, the server dedupes
  }
  try {
    const res = await fetch("/api/pass/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: wallet }),
    });
    if (!res.ok) return;
    try {
      localStorage.setItem(key, today);
    } catch {
      // storage blocked
    }
  } catch {
    // offline: try again next load
  }
}
