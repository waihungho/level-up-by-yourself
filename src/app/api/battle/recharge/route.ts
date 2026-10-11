import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { rechargeFights } from "@/lib/tactical/recharge-service";
import { verifySolPayment } from "@/lib/verify-payment";

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof rechargeFights>[0]>(req);
  if (!body) return missingFields();
  return respond("battle/recharge", () => rechargeFights(body, { verify: verifySolPayment }));
}
