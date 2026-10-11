import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { upgradeGear } from "@/lib/shop/gear-service";

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof upgradeGear>[0]>(req);
  if (!body) return missingFields();
  return respond("shop/gear", () => upgradeGear(body));
}
