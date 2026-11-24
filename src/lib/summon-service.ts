import { generateInitialDimensions, generateSpriteSeed } from "@/lib/agent-init";
import { DAILY_TASKS, SUMMON_COOLDOWN_DAYS, SUMMON_COST_SOL } from "@/lib/constants";
import { completeTask, getCompletedTasksToday, getPlayerByWallet, summonAgent } from "@/lib/db";
import { summonMemo } from "@/lib/payment-memos";
import { getWriteClient } from "@/lib/supabase-admin";
import { fail, type ServiceResult } from "@/lib/tactical/service-common";
import type { Agent, RoleCategory } from "@/lib/types";

export const SUMMON_LIMITS = { name: 30, roleTitle: 40, character: 500, objective: 500 } as const;
const ROLES: RoleCategory[] = ["future", "modern", "medieval"];

export interface SummonDeps {
  /** Confirms on-chain that the signature paid `minSol` from the wallet to the treasury with `memo`. */
  verify: (input: { signature: string; payer: string; minSol: number; memo?: string }) => Promise<boolean>;
}

function text(x: unknown, max: number): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim();
  return t && t.length <= max ? t : null;
}

function mapAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    playerId: row.player_id as string,
    name: row.name as string,
    role: row.role as RoleCategory,
    roleTitle: row.role_title as string,
    character: row.character as string,
    objective: row.objective as string,
    spriteSeed: row.sprite_seed as Record<string, unknown>,
    createdAt: row.created_at as string,
  };
}

/**
 * Summons an agent. Starting stats and sprite genes are rolled here, never sent by the browser.
 * Without `signature` this is the free summon (7-day cooldown); with one, the 0.1 SOL payment
 * (memo `levelup:summon:<wallet>`) is verified on-chain and its signature can be used once.
 */
export async function summon(
  input: { walletAddress?: unknown; name?: unknown; role?: unknown; roleTitle?: unknown; character?: unknown; objective?: unknown; signature?: unknown },
  deps: SummonDeps
): Promise<ServiceResult> {
  if (typeof input.walletAddress !== "string" || !input.walletAddress) return fail(400, "missing_fields");
  const name = text(input.name, SUMMON_LIMITS.name);
  const roleTitle = text(input.roleTitle, SUMMON_LIMITS.roleTitle);
  const character = text(input.character, SUMMON_LIMITS.character);
  const objective = text(input.objective, SUMMON_LIMITS.objective);
  if (!name || !roleTitle || !character || !objective) return fail(400, "invalid_fields");
  if (!ROLES.includes(input.role as RoleCategory)) return fail(400, "invalid_role");
  const role = input.role as RoleCategory;
  const signature = input.signature === undefined || input.signature === null ? null : typeof input.signature === "string" && input.signature ? input.signature : undefined;
  if (signature === undefined) return fail(400, "invalid_fields");

  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");

  if (signature && !(await deps.verify({ signature, payer: input.walletAddress, minSol: SUMMON_COST_SOL, memo: summonMemo(input.walletAddress) }))) {
    return fail(402, "payment_invalid");
  }

  const initialDimensions = generateInitialDimensions(role);
  const spriteSeed = generateSpriteSeed(role, name, character);
  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_summon_agent_server", {
      p_player_id: player.id,
      p_name: name,
      p_role: role,
      p_role_title: roleTitle,
      p_character: character,
      p_objective: objective,
      p_sprite_seed: spriteSeed,
      p_initial_dimensions: initialDimensions.map((d) => ({ dimension_id: d.dimensionId, value: d.value })),
      p_payment_signature: signature,
      p_cooldown_days: SUMMON_COOLDOWN_DAYS,
    });
    // Agent names are unique game-wide; the whole summon (payment record included) rolls back.
    if (error && error.code === "23505" && /name/.test(error.message ?? "")) return fail(409, "name_taken");
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { result: string; agent: Record<string, unknown> | null };
    switch (row.result) {
      case "ok":
        return { status: 200, body: { agent: mapAgent(row.agent!) } };
      case "cooldown":
        return fail(429, "cooldown");
      case "signature_used":
        return fail(409, "signature_used");
      case "not_found":
        return fail(403, "not_owner");
      default:
        throw new Error(`summon: ${row.result}`);
    }
  }

  // Demo mode: in-memory, no payments.
  if (!signature && player.lastSummonAt && Date.now() - Date.parse(player.lastSummonAt) < SUMMON_COOLDOWN_DAYS * 86_400_000) return fail(429, "cooldown");
  const agent = await summonAgent({ playerId: player.id, name, role, roleTitle, character, objective, spriteSeed, initialDimensions });
  return { status: 200, body: { agent } };
}

/** Completes one of today's daily tasks for its ability points, once per task per UTC day. */
export async function completeDailyTask(input: { walletAddress?: unknown; taskName?: unknown }): Promise<ServiceResult> {
  if (typeof input.walletAddress !== "string" || !input.walletAddress) return fail(400, "missing_fields");
  const task = DAILY_TASKS.find((t) => t.name === input.taskName);
  if (!task) return fail(400, "invalid_task");
  const player = await getPlayerByWallet(input.walletAddress);
  if (!player) return fail(403, "not_owner");

  const sb = getWriteClient();
  if (sb) {
    const { data, error } = await sb.rpc("levelup_complete_task", { p_player: player.id, p_task: task.name, p_points: task.abilityPoints });
    if (error) throw error;
    if (data === "already_done") return fail(409, "already_done");
    return { status: 200, body: { task: task.name, points: task.abilityPoints } };
  }

  // Demo mode
  if ((await getCompletedTasksToday(player.id)).includes(task.name)) return fail(409, "already_done");
  await completeTask(player.id, task.name);
  return { status: 200, body: { task: task.name, points: task.abilityPoints } };
}

