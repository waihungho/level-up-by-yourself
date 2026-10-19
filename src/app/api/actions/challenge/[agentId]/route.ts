import type { NextRequest } from "next/server";
import { actionOptions, readActionBody, respondAction } from "@/lib/blinks/actions";
import { blinkDeps, buildChallengeTx, getChallengeAction } from "@/lib/blinks/challenge-service";
import { siteOrigin } from "@/lib/blinks/links";

type Ctx = { params: Promise<{ agentId: string }> };

/** The card changes only when the agent grows; a short CDN cache absorbs unfurl bursts. */
const GET_CACHE = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=600" };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { agentId } = await params;
  return respondAction("blink/get", () => getChallengeAction(agentId, siteOrigin(req.nextUrl.origin)), GET_CACHE);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { agentId } = await params;
  const body = await readActionBody(req);
  return respondAction("blink/post", () => buildChallengeTx({ agentId, account: body.account }, siteOrigin(req.nextUrl.origin), blinkDeps()));
}

export const OPTIONS = actionOptions;
