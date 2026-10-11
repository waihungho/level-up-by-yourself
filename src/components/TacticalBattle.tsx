"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PixelSprite } from "@/components/PixelSprite";
import { CounterWheel } from "@/components/CounterWheel";
import { ActionGrid } from "@/components/tactical/ActionGrid";
import { FocusPips } from "@/components/tactical/FocusPips";
import { HpBar } from "@/components/tactical/HpBar";
import { IntentBanner } from "@/components/tactical/IntentBanner";
import { RoundLog } from "@/components/tactical/RoundLog";
import { readTutorialSeen, writeTutorialSeen } from "@/components/tactical/categoryStyle";
import { useBattleTurns, type TurnResponse } from "@/components/tactical/useBattleTurns";
import { SPECIALS } from "@/lib/tactical/constants";
import { counterFor } from "@/lib/tactical/engine";
import type { TacticalRound, TacticalState } from "@/lib/tactical/types";
import type { AgentWithDimensions, BattleLog } from "@/lib/types";

export interface TacticalBattleProps {
  sessionId: string;
  initialState: TacticalState;
  attacker: AgentWithDimensions;
  defender: AgentWithDimensions;
  walletAddress: string;
  onFinished: (log: BattleLog) => void;
}

const HIT_MS = 700;
const AUTO_STEP_MS = 300;

interface Hit {
  attackerDamage: number;
  defenderDamage: number;
  countered: boolean;
}

function damageTo(r: TacticalRound, attackerId: string): Hit {
  const attackerFirst = r.firstAttacker === attackerId;
  return {
    attackerDamage: attackerFirst ? r.secondDamage : r.firstDamage,
    defenderDamage: attackerFirst ? r.firstDamage : r.secondDamage,
    countered: r.countered,
  };
}

const TUTORIAL = [
  { title: "Read the intent", body: "Each round your opponent telegraphs what it will strike with. Watch the banner above the buttons." },
  { title: "Counter it", body: "Every category beats the next one around the wheel. Strike with the category that beats theirs for bonus damage and +1 Focus — but guess wrong and you get countered." },
  { title: "Focus & Specials", body: "Focus builds every round (faster with Guard and counters). Spend 3 on your role's Special. Guard a telegraphed SPECIAL. Short on time? Auto finishes the fight for you." },
];

export function TacticalBattle({ sessionId, initialState, attacker, defender, walletAddress, onFinished }: TacticalBattleProps) {
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [hintsOn, setHintsOn] = useState(false);
  const [hit, setHit] = useState<Hit | null>(null);
  const [display, setDisplay] = useState<{ attacker: number; defender: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pending = useRef<{ res: TurnResponse<TacticalState> } | null>(null);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    const seen = readTutorialSeen();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setHintsOn(seen);
    if (!seen) setTutorialStep(0);
    const pendingTimers = timers.current;
    return () => pendingTimers.forEach(clearTimeout);
  }, []);

  const applyFinalRef = useRef<() => void>(() => {});

  const { state, setState, busy, error, send } = useBattleTurns<TacticalState>({
    sessionId,
    walletAddress,
    initialState,
    onResponse: (res) => {
      const rounds = res.rounds ?? [];
      pending.current = { res };
      const finish = () => applyFinalRef.current();
      if (rounds.length === 0) return finish();
      setPlaying(true);
      const step = rounds.length > 1 ? AUTO_STEP_MS : HIT_MS;
      rounds.forEach((r, i) => {
        timers.current.push(
          setTimeout(() => {
            setHit(damageTo(r, attacker.id));
            setDisplay({ attacker: r.attackerHpAfter, defender: r.defenderHpAfter });
          }, i * step)
        );
      });
      timers.current.push(setTimeout(finish, rounds.length * step));
    },
  });

  useEffect(() => {
    applyFinalRef.current = () => {
      const p = pending.current;
      if (!p) return;
      pending.current = null;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setPlaying(false);
      setHit(null);
      setDisplay(null);
      setState(p.res.state);
      if (p.res.finished && p.res.battleLog) onFinishedRef.current(p.res.battleLog as BattleLog);
    };
  }, [setState]);

  const closeTutorial = useCallback(() => {
    writeTutorialSeen();
    setTutorialStep(null);
    setHintsOn(true);
  }, []);

  const me = state.sides.attacker;
  const foe = state.sides.defender;
  const hpA = display?.attacker ?? me.hp;
  const hpD = display?.defender ?? foe.hp;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between font-mono text-xs text-gray-500">
        <span>Round {Math.min(state.round + 1, 12)}</span>
        <span>
          {SPECIALS[me.role].name} ready at 3 focus
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 items-end">
        <div className="space-y-1">
          <div className={`flex justify-center ${hit && hit.attackerDamage > 0 ? "animate-shakeHit" : ""}`}>
            <PixelSprite spriteSeed={attacker.spriteSeed as Record<string, number>} role={attacker.role} size={72} />
          </div>
          <HpBar name={attacker.name} hp={hpA} maxHp={me.maxHp} floater={hit?.attackerDamage || null} />
          <FocusPips focus={me.focus} />
        </div>
        <div className="space-y-1">
          <div className={`flex justify-center ${hit && hit.defenderDamage > 0 ? "animate-shakeHit" : ""}`}>
            <PixelSprite spriteSeed={defender.spriteSeed as Record<string, number>} role={defender.role} size={72} />
          </div>
          <HpBar name={defender.name} hp={hpD} maxHp={foe.maxHp} align="right" floater={hit?.defenderDamage || null} />
          <FocusPips focus={foe.focus} />
        </div>
      </div>

      {hit?.countered && <div className="text-center font-mono font-bold text-yellow-300 animate-vsSlam">COUNTER!</div>}

      {!state.finished && <IntentBanner name={defender.name} intent={state.intent} showHint={hintsOn} />}

      {playing && (
        <button type="button" onClick={() => applyFinalRef.current()} className="w-full font-mono text-xs text-gray-400 underline">
          Skip ▶
        </button>
      )}

      {!state.finished && (
        <ActionGrid
          intent={state.intent}
          focus={me.focus}
          role={me.role}
          stunned={me.stunned}
          disabled={busy || playing}
          showHint={hintsOn}
          onAction={(a) => send(a)}
        />
      )}

      {error && <p className="text-center font-mono text-xs text-red-400">{error}</p>}

      <RoundLog rounds={state.rounds} attackerName={attacker.name} defenderName={defender.name} />

      <div className="flex justify-center">
        <button type="button" onClick={() => setTutorialStep(0)} className="font-mono text-[10px] text-gray-600 underline">
          How do counters work?
        </button>
      </div>

      {tutorialStep !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 max-w-sm w-full space-y-3">
            <p className="font-mono text-[10px] text-gray-500">How tactical battles work · {tutorialStep + 1}/{TUTORIAL.length}</p>
            <h3 className="font-mono font-bold text-white">{TUTORIAL[tutorialStep].title}</h3>
            {tutorialStep === 1 && (
              <div className="flex justify-center">
                <CounterWheel highlight={state.intent.kind === "strike" ? counterFor(state.intent.category) : null} />
              </div>
            )}
            <p className="font-mono text-xs text-gray-300 leading-relaxed">{TUTORIAL[tutorialStep].body}</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={closeTutorial} className="font-mono text-xs text-gray-500">
                Skip
              </button>
              <button
                type="button"
                onClick={() => (tutorialStep + 1 < TUTORIAL.length ? setTutorialStep(tutorialStep + 1) : closeTutorial())}
                className="px-4 py-2 rounded bg-purple-600 text-white font-mono text-xs font-bold min-h-[44px]"
              >
                {tutorialStep + 1 < TUTORIAL.length ? "Next" : "Fight!"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
