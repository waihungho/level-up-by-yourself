import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { weaponTint } from "@/components/shop/gearStyle";
import { ChallengeView } from "@/components/blinks/ChallengeView";
import { getAgentRecord, getRecentChallenges } from "@/lib/blinks/challenge-read";
import { agentAvatarUrl, challengePageUrl } from "@/lib/blinks/links";
import { getAgentWithDimensions } from "@/lib/db";
import { getGearForAgents } from "@/lib/shop/gear-read";
import { totalStats } from "@/lib/squads";

type Props = { params: Promise<{ agentId: string }> };

/** The request's origin (Vercel sets x-forwarded-*); localhost only as a last resort for dev. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Gear and challenge history. A failed read shows an empty list instead of breaking the page. */
async function loadHistory(agentId: string) {
  const [gear, record, recent] = await Promise.all([
    getGearForAgents([agentId]).then((g) => g[agentId]).catch(() => undefined),
    getAgentRecord(agentId).catch(() => ({ wins: 0, losses: 0 })),
    getRecentChallenges(agentId).catch(() => []),
  ]);
  return { gear, record, recent, now: Date.now() };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { agentId } = await params;
  const [agent, origin] = await Promise.all([getAgentWithDimensions(agentId), requestOrigin()]);
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

export default async function ChallengePage({ params }: Props) {
  const { agentId } = await params;
  const [agent, origin] = await Promise.all([getAgentWithDimensions(agentId), requestOrigin()]);
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
    />
  );
}
