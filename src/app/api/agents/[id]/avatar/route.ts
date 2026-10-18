import { NextResponse, type NextRequest } from "next/server";
import { weaponTint } from "@/components/shop/gearStyle";
import { getAgentsByIds } from "@/lib/db";
import { renderAvatarPng } from "@/lib/nft/render-avatar";
import { getGearForAgents } from "@/lib/shop/gear-read";
import type { SpriteSeed } from "@/lib/sprite-renderer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => NextResponse.json({ error: "agent_not_found" }, { status: 404, headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });

/** The agent's sprite as a 512×512 PNG (Blink icon, social cards). Cached for a day. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  // One cache entry per agent: query strings can't be used to bust the CDN and force renders.
  if (req.nextUrl.search) {
    const bare = req.nextUrl.clone();
    bare.search = "";
    return NextResponse.redirect(bare, 308);
  }
  try {
    const [agent] = await getAgentsByIds([id]);
    if (!agent) return notFound();
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
    return NextResponse.json({ error: "internal" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
