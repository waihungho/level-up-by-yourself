import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { buyGemPack } from "@/lib/shop/shop-service";
import { verifySolPayment } from "@/lib/verify-payment";

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof buyGemPack>[0]>(req);
  if (!body) return missingFields();
  return respond("shop/gems", () => buyGemPack(body, { verify: verifySolPayment }));
}
