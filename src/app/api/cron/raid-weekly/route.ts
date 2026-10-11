import { runRaidWeekly } from "@/lib/raid/raid-cron";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await runRaidWeekly(new Date());
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("Raid weekly cron failed:", error);
    return Response.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
