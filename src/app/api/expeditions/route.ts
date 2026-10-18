import type { NextRequest } from "next/server";
import { respond } from "@/lib/api-route";
import { getExpeditionsView } from "@/lib/expeditions/expedition-service";

export async function GET(req: NextRequest) {
  return respond("expeditions GET", () => getExpeditionsView({ walletAddress: req.nextUrl.searchParams.get("wallet") ?? undefined }));
}
