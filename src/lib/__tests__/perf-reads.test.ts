import { describe, it, expect } from "vitest";
import { bootstrapPlayer, getFightCountsToday, getOrCreatePlayer, getPlayerAgents } from "../db";
import { applyRaidDamage, createBoss, getChampionAndPlayerLabel, getRaidStandings } from "../raid/raid-db";
import { BOSSES, computeBossStats } from "../raid/bosses";

describe("bootstrapPlayer", () => {
  it("creates the player once and returns their agents", async () => {
    const wallet = "boot-" + crypto.randomUUID();
    const first = await bootstrapPlayer(wallet);
    const again = await bootstrapPlayer(wallet);
    expect(again.player.id).toBe(first.player.id);
    expect(again.agents.map((a) => a.id)).toEqual((await getPlayerAgents(first.player.id)).map((a) => a.id));
  });
});

describe("getFightCountsToday", () => {
  it("returns zeroed training and PvP counts for every requested agent", async () => {
    const p = await getOrCreatePlayer("fc-" + crypto.randomUUID());
    const ids = (await getPlayerAgents(p.id)).slice(0, 3).map((a) => a.id);
    const counts = await getFightCountsToday(ids);
    expect(Object.keys(counts.training).sort()).toEqual([...ids].sort());
    expect(Object.values(counts.pvp)).toEqual([0, 0, 0]);
  });
});

describe("getRaidStandings / getChampionAndPlayerLabel", () => {
  it("returns the top slice, participant count and the player's own rank", async () => {
    const boss = await createBoss({ bossKey: BOSSES[0].key, weekStart: "2032-03-01", stats: computeBossStats([], BOSSES[0]), maxHp: 1_000_000 });
    const players = await Promise.all([0, 1, 2, 3].map((i) => getOrCreatePlayer(`rs-${i}-` + crypto.randomUUID())));
    for (const [i, p] of players.entries()) {
      await applyRaidDamage({ bossId: boss.id, playerId: p.id, damage: 100 * (i + 1), bestHit: 1, counters: 0, label: `L${i}` });
    }

    const s = await getRaidStandings(boss.id, players[0].id, 2);
    expect(s.top.map((c) => c.label)).toEqual(["L3", "L2"]);
    expect(s.participants).toBe(4);
    expect(s.me).toEqual({ rank: 4, damage: 100 });
    expect((await getRaidStandings(boss.id, null, 2)).me).toBeNull();

    expect(await getChampionAndPlayerLabel(boss.id, players[1].id)).toEqual({ champion: "L3", player: "L1" });
  });
});
