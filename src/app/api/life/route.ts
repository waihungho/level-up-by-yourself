import type { NextRequest } from "next/server";
import { respond } from "@/lib/api-route";
import { getLifeView } from "@/lib/life/life-service";

export async function GET(req: NextRequest) {
  return respond("life GET", () => getLifeView({ walletAddress: req.nextUrl.searchParams.get("wallet") ?? undefined }));
}
