import { runDailyGrowth } from "@/scripts/daily-growth";
import { serviceDeps } from "@/lib/api-route";
import { sweepStaleSessions } from "@/lib/tactical/battle-service";
import { retryPendingPayout } from "@/lib/raid/raid-service";

export const maxDuration = 300;

/** Battles left open longer than this are auto-resolved by the daily sweep. */
const STALE_SESSION_MS = 30 * 60 * 1000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await runDailyGrowth();
    const deps = { ...serviceDeps(), defer: undefined };
    const swept = await sweepStaleSessions(new Date(Date.now() - STALE_SESSION_MS).toISOString(), deps);
    await retryPendingPayout();
    return Response.json({ ok: true, swept });
  } catch (error) {
    console.error("Daily growth cron failed:", error);
    return Response.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}
