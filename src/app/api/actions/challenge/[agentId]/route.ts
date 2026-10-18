import type { NextRequest } from "next/server";
import { actionOptions, readActionBody, respondAction } from "@/lib/blinks/actions";
import { blinkDeps, buildChallengeTx, getChallengeAction } from "@/lib/blinks/challenge-service";

type Ctx = { params: Promise<{ agentId: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { agentId } = await params;
  return respondAction("blink/get", () => getChallengeAction(agentId, req.nextUrl.origin));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { agentId } = await params;
  const body = await readActionBody(req);
  return respondAction("blink/post", () => buildChallengeTx({ agentId, account: body.account }, req.nextUrl.origin, blinkDeps()));
}

export const OPTIONS = actionOptions;
