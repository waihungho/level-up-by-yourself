import type { NextRequest } from "next/server";
import { respond } from "@/lib/api-route";
import { getShopView } from "@/lib/shop/shop-service";

export async function GET(req: NextRequest) {
  return respond("shop GET", () => getShopView({ walletAddress: req.nextUrl.searchParams.get("wallet") ?? undefined }));
}
