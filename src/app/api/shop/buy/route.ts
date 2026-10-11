import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { buyItem } from "@/lib/shop/shop-service";

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof buyItem>[0]>(req);
  if (!body) return missingFields();
  return respond("shop/buy", () => buyItem(body));
}
