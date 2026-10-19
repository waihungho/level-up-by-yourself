import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { cache } from "react";
import { weaponTint } from "@/components/shop/gearStyle";
import { ChallengeView, type ChallengeOutcome } from "@/components/blinks/ChallengeView";
import { isActionError } from "@/lib/blinks/actions";
import { getAgentRecord, getRecentChallenges } from "@/lib/blinks/challenge-db";
import { blinkDeps, resolveChallenge } from "@/lib/blinks/challenge-service";
import { agentAvatarUrl, challengePageUrl, siteOrigin } from "@/lib/blinks/links";
import { getAgentWithDimensions } from "@/lib/db";
import { getGearForAgents } from "@/lib/shop/gear-read";
import { totalStats } from "@/lib/squads";

type Props = {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ sig?: string | string[]; account?: string | string[] }>;
};

/** One agent load per request, shared by generateMetadata and the page. */
const loadAgent = cache((agentId: string) => getAgentWithDimensions(agentId));

/** The request's origin (Vercel sets x-forwarded-*), overridden by NEXT_PUBLIC_SITE_URL. */
const requestOrigin = cache(async (): Promise<string> => {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return siteOrigin("http://localhost:3000");
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return siteOrigin(`${proto}://${host}`);
});

/** Gear and challenge history. A failed read shows an empty list instead of breaking the page. */
async function loadHistory(agentId: string) {
  const [gear, record, recent] = await Promise.all([
    getGearForAgents([agentId]).then((g) => g[agentId]).catch(() => undefined),
    getAgentRecord(agentId).catch(() => ({ wins: 0, losses: 0 })),
    getRecentChallenges(agentId).catch(() => []),
  ]);
  return { gear, record, recent, now: Date.now() };
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * `?sig=&account=` comes from a Blink whose transaction the RPC hadn't seen yet: resolve it now
 * through the same (idempotent) path the Blink uses and show the outcome.
 */
async function resolveFromLink(agentId: string, origin: string, sig?: string, account?: string): Promise<ChallengeOutcome | null> {
  if (!sig || !account) return null;
  try {
    const r = await resolveChallenge({ agentId, account, signature: sig }, origin, blinkDeps());
    if (isActionError(r.body)) return { kind: "error", title: "Couldn't load your result", description: r.body.message };
    if (r.body.type === "transaction") return null;
    return { kind: "result", title: r.body.title, description: r.body.description };
  } catch (e) {
    console.error("[challenge page]", e);
    return { kind: "error", title: "Couldn't load your result", description: "Something went wrong. Refresh to try again." };
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { agentId } = await params;
  const [agent, origin] = await Promise.all([loadAgent(agentId), requestOrigin()]);
  if (!agent) return { title: "Challenge | Level Up By Yourself" };
  const title = `Fight ${agent.name} | Level Up By Yourself`;
  const description = `${agent.roleTitle} · Total Power ${Math.round(totalStats(agent))}. Fight it from a Solana Blink.`;
  const image = agentAvatarUrl(origin, agent.id);
  return {
    title,
    description,
    openGraph: { title, description, url: challengePageUrl(origin, agent.id), images: [{ url: image, width: 512, height: 512 }] },
    twitter: { card: "summary", title, description, images: [image] },
  };
}

export default async function ChallengePage({ params, searchParams }: Props) {
  const [{ agentId }, query] = await Promise.all([params, searchParams]);
  const [agent, origin] = await Promise.all([loadAgent(agentId), requestOrigin()]);
  if (!agent) {
    return (
      <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4 font-mono">
        <p className="text-gray-400 mb-4">This agent doesn&apos;t exist.</p>
        <Link href="/" className="text-purple-400">
          Play Level Up
        </Link>
      </main>
    );
  }

  // Resolve first so a just-recorded fight shows up in the history below.
  const outcome = await resolveFromLink(agent.id, origin, first(query.sig), first(query.account));
  const { gear, record, recent, now } = await loadHistory(agent.id);

  return (
    <ChallengeView
      agent={agent}
      weaponTint={weaponTint(gear)}
      power={Math.round(totalStats(agent))}
      record={record}
      recent={recent}
      origin={origin}
      now={now}
      outcome={outcome}
    />
  );
}
