import type { NextRequest } from "next/server";
import { respond } from "@/lib/api-route";
import { getLimitsView } from "@/lib/shop/shop-service";

export async function GET(req: NextRequest) {
  return respond("shop/limits", () => getLimitsView({ walletAddress: req.nextUrl.searchParams.get("wallet") ?? undefined }));
}
