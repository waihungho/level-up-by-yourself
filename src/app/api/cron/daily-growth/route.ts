import { runDailyGrowth } from "@/scripts/daily-growth";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    await runDailyGrowth();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Daily growth cron failed:", error);
    return Response.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}
