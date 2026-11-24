import type { NextRequest } from "next/server";
import { respond } from "@/lib/api-route";
import { getStoryView } from "@/lib/story/story-service";

export async function GET(req: NextRequest) {
  return respond("story GET", () => getStoryView({ walletAddress: req.nextUrl.searchParams.get("wallet") ?? undefined }));
}
