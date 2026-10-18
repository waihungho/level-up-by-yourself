import { NextResponse, type NextRequest } from "next/server";
import { weaponTint } from "@/components/shop/gearStyle";
import { getAgentsByIds } from "@/lib/db";
import { renderAvatarPng } from "@/lib/nft/render-avatar";
import { getGearForAgents } from "@/lib/shop/gear-read";
import type { SpriteSeed } from "@/lib/sprite-renderer";

export const runtime = "nodejs";

/** The agent's sprite as a 512×512 PNG (Blink icon, social cards). Cached for a day. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [agent] = await getAgentsByIds([id]);
    if (!agent) return NextResponse.json({ error: "agent_not_found" }, { status: 404 });
    const gear = (await getGearForAgents([id]))[id];
    const png = renderAvatarPng(agent.spriteSeed as unknown as SpriteSeed, agent.role, weaponTint(gear));
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("[agents/avatar]", e);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
