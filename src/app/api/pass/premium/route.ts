import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { buyPremium } from "@/lib/pass/pass-service";
import { verifySolPayment } from "@/lib/verify-payment";

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof buyPremium>[0]>(req);
  if (!body) return missingFields();
  return respond("pass/premium", () => buyPremium({ walletAddress: body.walletAddress, signature: body.signature }, { verify: verifySolPayment }));
}
