"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionGrid } from "@/components/tactical/ActionGrid";
import { FocusPips } from "@/components/tactical/FocusPips";
import { HpBar } from "@/components/tactical/HpBar";
import { IntentBanner } from "@/components/tactical/IntentBanner";
import { RoundLog } from "@/components/tactical/RoundLog";
import { CATEGORY_STYLE } from "@/components/tactical/categoryStyle";
import { readTutorialSeen } from "@/components/tactical/tutorialStorage";
import { FighterColumn } from "@/components/tactical/FighterColumn";
import { synergyLabel } from "@/components/tactical/synergyLabel";
import { useBattleTurns } from "@/components/tactical/useBattleTurns";
import { useRoundPlayback } from "@/components/tactical/useRoundPlayback";
import { SPECIAL_COST } from "@/lib/tactical/constants";
import type { SquadState, TeamState } from "@/lib/tactical/squad";
import type { SideKey, TacticalRound } from "@/lib/tactical/types";
import { currentWeakness, phaseFor, type RaidState } from "@/lib/raid/raid-engine";
import type { AgentWithDimensions } from "@/lib/types";

export interface SquadResult {
  winner: SideKey | null;
  growth?: unknown;
  ratingDelta?: number;
  [extra: string]: unknown;
}

export interface SquadBattleProps {
  sessionId: string;
  initialState: SquadState;
  attackers: AgentWithDimensions[];
  defenders: AgentWithDimensions[];
  walletAddress: string;
  onFinished: (result: SquadResult) => void;
}

function Bench({ team, agents, label }: { team: TeamState; agents: AgentWithDimensions[]; label: string }) {
  return (
    <div className="space-y-1" aria-label={label}>
      {team.members.map((m, i) => (
        <div key={m.agentId} className={`${m.hp <= 0 ? "opacity-30" : ""} ${i === team.active ? "" : "pl-2"}`}>
          <HpBar name={`${i === team.active ? "▶ " : ""}${agents[i]?.name ?? "?"}`} hp={m.hp} maxHp={m.maxHp} compact />
        </div>
      ))}
    </div>
  );
}

export function SquadBattle({ sessionId, initialState, attackers, defenders, walletAddress, onFinished }: SquadBattleProps) {
  const [hintsOn, setHintsOn] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const onFinishedRef = useRef(onFinished);
  const idForRound = useCallback((r: TacticalRound) => attackers[r.actorSlot ?? 0]?.id ?? "", [attackers]);
  const { hit, display, current, playing, play, skip } = useRoundPlayback(idForRound);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setHintsOn(readTutorialSeen());
  }, []);

  const { state, setState, busy, error, send } = useBattleTurns<SquadState>({
    sessionId,
    walletAddress,
    initialState,
    onResponse: (res) => {
      play(res.rounds ?? [], () => {
        setState(res.state);
        if (res.finished) {
          const extra = Object.fromEntries(Object.entries(res).filter(([k]) => !["rounds", "state", "finished"].includes(k)));
          onFinishedRef.current({ ...extra, winner: res.state.winner } as SquadResult);
        }
      });
    },
  });

  const A = state.teams.attacker;
  const D = state.teams.defender;
  // During playback show the member who acted in the round on screen, not the post-response active member.
  const shownSlot = current?.actorSlot ?? A.active;
  const me = A.members[A.active];
  const shown = A.members[shownSlot] ?? me;
  const foe = D.members[D.active];
  const meAgent = attackers[shownSlot];
  const foeAgent = defenders[D.active];
  const bench = A.members.map((m, i) => ({ m, i })).filter(({ m, i }) => i !== A.active && m.hp > 0);
  const canSwap = bench.length > 0 && !me.stunned;
  const tag = A.focus >= SPECIAL_COST;
  const raidState = state.mode === "raid" ? (state as RaidState) : null;
  const raid = raidState
    ? { weakness: currentWeakness(raidState.raid.def, phaseFor(foe.hp, raidState.raid.maxHp)), resist: raidState.raid.def.resist }
    : null;

  const swapButton = (
    <button
      type="button"
      disabled={busy || playing || !canSwap}
      onClick={() => setSwapOpen((v) => !v)}
      className="min-h-[44px] rounded-lg border font-mono text-xs font-bold border-emerald-500/70 bg-emerald-900/30 text-emerald-200 disabled:opacity-40"
    >
      ⇄ {tag ? "Tag!" : "Swap"}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-mono text-xs text-gray-500">
        <span>
          Round {Math.min(state.round + 1, state.maxRounds)} / {state.maxRounds}
        </span>
        {raid && (
          <span>
            Weak: <span className={CATEGORY_STYLE[raid.weakness].text}>{raid.weakness}</span> · Resists:{" "}
            <span className={CATEGORY_STYLE[raid.resist].text}>{raid.resist}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 items-end">
        <FighterColumn agent={meAgent} hp={display?.attacker ?? shown.hp} maxHp={shown.maxHp} damage={hit?.attackerDamage} size={64}>
          <FocusPips focus={A.focus} />
          {A.members.length > 1 && <p className="font-mono text-[10px] text-emerald-300">{synergyLabel(A.synergy)}</p>}
        </FighterColumn>
        <FighterColumn agent={foeAgent} hp={display?.defender ?? foe.hp} maxHp={foe.maxHp} damage={hit?.defenderDamage} align="right" size={raid ? 96 : 64}>
          {raid ? (
            <p className="font-mono text-[10px] text-red-300 text-right">Damage dealt: {state.damageDealt.toLocaleString()}</p>
          ) : (
            <p className="font-mono text-[10px] text-rose-300 text-right">{synergyLabel(D.synergy)}</p>
          )}
        </FighterColumn>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Bench team={A} agents={attackers} label="Your squad" />
        {!raid && <Bench team={D} agents={defenders} label="Enemy squad" />}
      </div>

      {hit?.countered && <div className="text-center font-mono font-bold text-yellow-300 animate-vsSlam">COUNTER!</div>}

      {!state.finished && foeAgent && <IntentBanner name={foeAgent.name} intent={state.intent} showHint={hintsOn} />}

      {playing && (
        <button type="button" onClick={skip} className="w-full font-mono text-xs text-gray-400 underline">
          Skip ▶
        </button>
      )}

      {!state.finished && (
        <ActionGrid
          intent={state.intent}
          focus={A.focus}
          role={me.role}
          stunned={me.stunned}
          disabled={busy || playing}
          showHint={hintsOn}
          onAction={(a) => {
            setSwapOpen(false);
            send(a);
          }}
          extra={A.members.length > 1 ? swapButton : undefined}
        />
      )}

      {swapOpen && canSwap && !state.finished && (
        <div className="grid grid-cols-2 gap-2">
          {bench.map(({ i }) => (
            <button
              key={i}
              type="button"
              disabled={busy || playing}
              onClick={() => {
                setSwapOpen(false);
                send({ type: "swap", slot: i });
              }}
              className="min-h-[44px] rounded-lg border border-emerald-600/60 bg-gray-900 font-mono text-xs text-emerald-200"
            >
              → {attackers[i]?.name}
              {tag ? " ✦" : ""}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-center font-mono text-xs text-red-400">{error}</p>}

      <RoundLog rounds={state.rounds} attackerName="You" defenderName={raid ? foeAgent?.name ?? "Boss" : "Enemy"} />
    </div>
  );
}
