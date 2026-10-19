import type { NextRequest } from "next/server";
import { respond } from "@/lib/api-route";
import { getPassView } from "@/lib/pass/pass-service";

export async function GET(req: NextRequest) {
  return respond("pass GET", () => getPassView({ walletAddress: req.nextUrl.searchParams.get("wallet") ?? undefined }));
}
