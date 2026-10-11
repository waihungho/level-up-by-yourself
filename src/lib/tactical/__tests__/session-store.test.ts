import { describe, it, expect, beforeEach } from "vitest";
import { MemorySessionStore } from "../session-store";

let store: MemorySessionStore;
beforeEach(() => {
  store = new MemorySessionStore();
});

const base = { mode: "training" as const, playerId: "p1", attackerId: "a1", defenderId: "d1", state: { round: 0 } };

describe("MemorySessionStore", () => {
  it("creates and reads back an active session", async () => {
    const s = await store.create(base);
    const got = await store.get<{ round: number }>(s.id);
    expect(got?.status).toBe("active");
    expect(got?.state.round).toBe(0);
    expect(got?.attackerId).toBe("a1");
  });

  it("returns null for an unknown id", async () => {
    expect(await store.get("nope")).toBeNull();
  });

  it("updates state only when the expected round matches", async () => {
    const s = await store.create(base);
    expect(await store.updateState(s.id, 0, { round: 1 })).toBe(true);
    expect(await store.updateState(s.id, 0, { round: 1 })).toBe(false);
    expect((await store.get<{ round: number }>(s.id))?.state.round).toBe(1);
  });

  it("does not update a finished session", async () => {
    const s = await store.create(base);
    await store.markFinished(s.id, "log-1");
    expect(await store.updateState(s.id, 0, { round: 1 })).toBe(false);
  });

  it("finds active sessions by agent on either side, and by player", async () => {
    await store.create(base);
    expect(await store.findActive({ agentId: "d1" })).toHaveLength(1);
    expect(await store.findActive({ agentId: "a1" })).toHaveLength(1);
    expect(await store.findActive({ playerId: "p1", mode: "pvp" })).toHaveLength(0);
    expect(await store.findActive({ playerId: "p1", mode: "training" })).toHaveLength(1);
  });

  it("counts only active sessions created today", async () => {
    const s = await store.create(base);
    await store.create(base);
    expect(await store.countActiveToday({ agentId: "a1", mode: "training" })).toBe(2);
    await store.markFinished(s.id, null);
    expect(await store.countActiveToday({ agentId: "a1", mode: "training" })).toBe(1);
    expect(await store.findActive({ agentId: "a1" })).toHaveLength(1);
  });

  it("lets exactly one caller claim finalisation, and a release makes it claimable again", async () => {
    const s = await store.create(base);
    const claims = await Promise.all([store.claimFinalize(s.id), store.claimFinalize(s.id)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await store.findActive({ agentId: "a1" })).toHaveLength(0);
    await store.releaseFinalize(s.id);
    expect(await store.claimFinalize(s.id)).toBe(true);
  });

  it("stores the finish result for later reads", async () => {
    const s = await store.create(base);
    await store.claimFinalize(s.id);
    await store.markFinished(s.id, "log-1", { winner: "attacker" });
    const got = await store.get(s.id);
    expect(got?.status).toBe("finished");
    expect(got?.result).toEqual({ winner: "attacker" });
  });

  it("finds active sessions created before a cutoff", async () => {
    await store.create(base);
    expect(await store.findStale(new Date(Date.now() + 1000).toISOString())).toHaveLength(1);
    expect(await store.findStale(new Date(Date.now() - 60_000).toISOString())).toHaveLength(0);
  });
});
