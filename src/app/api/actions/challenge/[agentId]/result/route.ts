import type { NextRequest } from "next/server";
import { actionOptions, readActionBody, respondAction } from "@/lib/blinks/actions";
import { blinkDeps, resolveChallenge } from "@/lib/blinks/challenge-service";

/** Action-chaining callback: the Blink client posts `{ account, signature }` after confirmation. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const body = await readActionBody(req);
  return respondAction("blink/result", () =>
    resolveChallenge({ agentId, account: body.account, signature: body.signature }, req.nextUrl.origin, blinkDeps())
  );
}

export const OPTIONS = actionOptions;
