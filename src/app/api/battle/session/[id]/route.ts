import type { NextRequest } from "next/server";
import { missingFields, respond, serviceDeps } from "@/lib/api-route";
import { getSessionView } from "@/lib/tactical/battle-service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return missingFields();
  return respond("battle/session", () => getSessionView({ sessionId: id, walletAddress: wallet }, serviceDeps()));
}
