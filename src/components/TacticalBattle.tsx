"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CounterWheel } from "@/components/CounterWheel";
import { ActionGrid } from "@/components/tactical/ActionGrid";
import { FocusPips } from "@/components/tactical/FocusPips";
import { IntentBanner } from "@/components/tactical/IntentBanner";
import { RoundLog } from "@/components/tactical/RoundLog";
import { readTutorialSeen, writeTutorialSeen } from "@/components/tactical/tutorialStorage";
import { FighterColumn } from "@/components/tactical/FighterColumn";
import { useBattleTurns } from "@/components/tactical/useBattleTurns";
import { useRoundPlayback } from "@/components/tactical/useRoundPlayback";
import { MAX_ROUNDS, SPECIAL_COST, SPECIALS } from "@/lib/tactical/constants";
import { counterFor } from "@/lib/tactical/engine";
import type { TacticalState } from "@/lib/tactical/types";
import type { AgentWithDimensions, BattleLog } from "@/lib/types";

export interface TacticalBattleProps {
  sessionId: string;
  initialState: TacticalState;
  attacker: AgentWithDimensions;
  defender: AgentWithDimensions;
  walletAddress: string;
  onFinished: (log: BattleLog) => void;
}

const TUTORIAL = [
  { title: "Read the intent", body: "Each round your opponent telegraphs what it will strike with. Watch the banner above the buttons." },
  { title: "Counter it", body: "Every category beats the next one around the wheel. Strike with the category that beats theirs for bonus damage and +1 Focus — but guess wrong and you get countered." },
  { title: "Focus & Specials", body: "Focus builds every round (faster with Guard and counters). Spend 3 on your role's Special. Guard a telegraphed SPECIAL. Short on time? Auto finishes the fight for you." },
];

export function TacticalBattle({ sessionId, initialState, attacker, defender, walletAddress, onFinished }: TacticalBattleProps) {
  const [tutorialStep, setTutorialStep] = useState<number | null>(null);
  const [hintsOn, setHintsOn] = useState(false);
  const onFinishedRef = useRef(onFinished);
  const attackerId = attacker.id;
  const idForRound = useCallback(() => attackerId, [attackerId]);
  const { hit, display, playing, play, skip } = useRoundPlayback(idForRound);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    const seen = readTutorialSeen();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setHintsOn(seen);
    if (!seen) setTutorialStep(0);
  }, []);

  const { state, setState, busy, error, send } = useBattleTurns<TacticalState>({
    sessionId,
    walletAddress,
    initialState,
    onResponse: (res) => {
      play(res.rounds ?? [], () => {
        setState(res.state);
        if (res.finished && res.battleLog) onFinishedRef.current(res.battleLog as BattleLog);
      });
    },
  });

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
        <span>Round {Math.min(state.round + 1, MAX_ROUNDS)}</span>
        <span>
          {SPECIALS[me.role].name} ready at {SPECIAL_COST} focus
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 items-end">
        <FighterColumn agent={attacker} hp={hpA} maxHp={me.maxHp} damage={hit?.attackerDamage}>
          <FocusPips focus={me.focus} />
        </FighterColumn>
        <FighterColumn agent={defender} hp={hpD} maxHp={foe.maxHp} damage={hit?.defenderDamage} align="right">
          <FocusPips focus={foe.focus} />
        </FighterColumn>
      </div>

      {hit?.countered && <div className="text-center font-mono font-bold text-yellow-300 animate-vsSlam">COUNTER!</div>}

      {!state.finished && <IntentBanner name={defender.name} intent={state.intent} showHint={hintsOn} />}

      {playing && (
        <button type="button" onClick={skip} className="w-full font-mono text-xs text-gray-400 underline">
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
