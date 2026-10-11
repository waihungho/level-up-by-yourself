import { after, type NextRequest } from "next/server";
import { respond } from "@/lib/api-route";
import { getRaidView } from "@/lib/raid/raid-service";

export async function GET(req: NextRequest) {
  return respond("raid GET", () =>
    getRaidView({ walletAddress: req.nextUrl.searchParams.get("wallet") ?? undefined }, { defer: (task) => after(task) })
  );
}
