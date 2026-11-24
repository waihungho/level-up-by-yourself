import { getAgentWithDimensions, getPlayerAgents, getPlayerByWallet } from "@/lib/db";
import { activeEvents, activeEventStage, nextEvent } from "@/lib/events/calendar";
import { growthFor } from "@/lib/life/catalog";
import { withGear } from "@/lib/shop/gear-db";
import { parseAction } from "@/lib/tactical/battle-service-actions";
import { ROLE_CATEGORY } from "@/lib/tactical/constants";
import { createBattle, resolveRound, runAuto, toBattleLog } from "@/lib/tactical/engine";
import { fail, type ModeHandler, type ServiceDeps, type ServiceResult } from "@/lib/tactical/service-common";
import type { PlayerAction, TacticalState } from "@/lib/tactical/types";
import type { Player } from "@/lib/types";
import { CHAPTERS, enemyAgent, STORY_STAGES, unlockedStoryStages, type Stage } from "./catalog";
import { getClearedStages, recordClear } from "./story-db";

export type StoryState = TacticalState & { stageId: string };

type StageStatus = "cleared" | "open" | "locked";

function stageView(stage: Stage, status: StageStatus) {
  return { id: stage.id, title: stage.title, intro: stage.intro, enemy: stage.enemy, reward: stage.reward, status };
}

/** Event stages unlock in order, like story stages. */
function eventStageStatus(stages: Stage[], index: number, cleared: ReadonlySet<string>): StageStatus {
  if (cleared.has(stages[index].id)) return "cleared";
  return index === 0 || cleared.has(stages[index - 1].id) ? "open" : "locked";
}

/** Chapters, active seasonal events and the player's progress for the /story page. */
export async function getStoryView(input: { walletAddress?: unknown }, now: Date = new Date()): Promise<ServiceResult> {
  if (typeof input.walletAddress !== "string" || !input.walletAddress) return fail(400, "missing_fields");
  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");
  const [cleared, agents] = await Promise.all([getClearedStages(player.id), getPlayerAgents(player.id)]);
  const open = unlockedStoryStages(cleared);
  const next = nextEvent(now);

  return {
    status: 200,
    body: {
      chapters: CHAPTERS.map((c) => ({
        id: c.id,
        title: c.title,
        blurb: c.blurb,
        stages: c.stages.map((s) => stageView(s, cleared.has(s.id) ? "cleared" : open.has(s.id) ? "open" : "locked")),
      })),
      events: activeEvents(now).map((e) => ({
        id: e.def.id,
        name: e.def.name,
        tagline: e.def.tagline,
        emoji: e.def.emoji,
        theme: e.def.theme,
        endsAt: e.endsAt,
        stages: e.stages.map((s, i) => stageView(s, eventStageStatus(e.stages, i, cleared))),
      })),
      nextEvent: { name: next.def.name, emoji: next.def.emoji, startsAt: next.startsAt },
      clearedCount: STORY_STAGES.filter((s) => cleared.has(s.id)).length,
      totalStages: STORY_STAGES.length,
      agents: agents.map((a) => ({ id: a.id, name: a.name, role: a.role, roleTitle: a.roleTitle })),
    },
  };
}

/** The stage if the player may fight it now (unlocked story stage, or an open stage of a running event). */
async function fightableStage(playerId: string, stageId: string, now: Date): Promise<Stage | null> {
  const cleared = await getClearedStages(playerId);
  const story = STORY_STAGES.find((s) => s.id === stageId);
  if (story) return unlockedStoryStages(cleared).has(stageId) ? story : null;
  const ev = activeEventStage(stageId, now);
  if (!ev) return null;
  return eventStageStatus(ev.event.stages, ev.index, cleared) === "locked" ? null : ev.stage;
}

/**
 * Starts a story or event fight. The caller (battle-service) has already resolved the player's
 * abandoned story sessions. Fights are unlimited; only the first win on a stage pays.
 */
export async function startStoryBattle(
  player: Player,
  input: { agentId?: string; stageId?: string },
  deps: ServiceDeps,
  now: Date = new Date()
): Promise<ServiceResult> {
  const { agentId, stageId } = input;
  if (!agentId || typeof stageId !== "string" || !stageId) return fail(400, "missing_fields");
  const agent = await getAgentWithDimensions(agentId);
  if (!agent || agent.playerId !== player.id) return fail(403, "not_owner");
  if (!agent.dimensions.length) return fail(500, "internal");
  const stage = await fightableStage(player.id, stageId, now);
  if (!stage) return fail(409, "stage_locked");

  const [attacker] = await withGear([agent]);
  const defender = enemyAgent(stage.id, stage.enemy);
  const state: StoryState = { ...createBattle(attacker, defender, "training", deps.rng), stageId: stage.id };
  const session = await deps.store.create({ mode: "story", playerId: player.id, attackerId: attacker.id, defenderId: null, state });
  return { status: 200, body: { sessionId: session.id, state, attacker, defender, stage: stageView(stage, "open") } };
}

function stageById(stageId: string): Stage | null {
  return STORY_STAGES.find((s) => s.id === stageId) ?? null;
}

/** Finds a stage by id, including event stages whose window has closed (an abandoned fight resolved later). */
function anyStage(stageId: string, at: Date): Stage | null {
  return stageById(stageId) ?? activeEventStage(stageId, at)?.stage ?? null;
}

export const storyHandler: ModeHandler<StoryState> = {
  parseAction: (raw) => parseAction(raw) as ReturnType<ModeHandler<StoryState>["parseAction"]>,
  resolve: (state, action, rng) => ({ ...resolveRound(state, action as unknown as PlayerAction, rng, { manual: true }), stageId: state.stageId }),
  auto: (state, rng) => ({ ...runAuto(state, rng), stageId: state.stageId }),
  invalidCode: () => "invalid_action",
  async finalize(session, state, deps) {
    // Story fights grow agents only through the stage reward, never through the usual battle growth.
    const log = { ...toBattleLog(state, session.id, session.createdAt), attackerGrowth: {}, defenderGrowth: {} };
    const won = state.winner === "attacker";
    // Event stages are judged by the session start, so a fight begun before the window closed still counts.
    const stage = anyStage(state.stageId, new Date(session.createdAt));
    if (!won || !stage || !session.attackerId) return { battleLog: log, story: { stageId: state.stageId, won, firstClear: false } };

    const agent = await getAgentWithDimensions(session.attackerId);
    const category = agent ? ROLE_CATEGORY[agent.role] : "Physical";
    const growth = growthFor(category, stage.reward.growth, deps.rng);
    const { firstClear, balance } = await recordClear({ playerId: session.playerId, stageId: stage.id, agentId: session.attackerId, gems: stage.reward.gems, growth });
    return {
      battleLog: log,
      story: { stageId: stage.id, won, firstClear, gems: firstClear ? stage.reward.gems : 0, growth: firstClear ? growth : {}, balance },
    };
  },
};
