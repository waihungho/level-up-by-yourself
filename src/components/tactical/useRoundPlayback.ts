"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TacticalRound } from "@/lib/tactical/types";

export interface Hit {
  attackerDamage: number;
  defenderDamage: number;
  countered: boolean;
}

const HIT_MS = 700;
const AUTO_STEP_MS = 300;

/** Damage each side took in a round, given the acting attacker's agent id. */
export function damageTo(r: TacticalRound, attackerAgentId: string): Hit {
  const attackerFirst = r.firstAttacker === attackerAgentId;
  return {
    attackerDamage: attackerFirst ? r.secondDamage : r.firstDamage,
    defenderDamage: attackerFirst ? r.firstDamage : r.secondDamage,
    countered: r.countered,
  };
}

/**
 * Animates returned rounds one by one (slower for a single manual round, faster for Auto),
 * then calls the completion callback. `skip` jumps straight to completion.
 */
export function useRoundPlayback(attackerIdForRound: (r: TacticalRound) => string) {
  const [hit, setHit] = useState<Hit | null>(null);
  const [display, setDisplay] = useState<{ attacker: number; defender: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const done = useRef<(() => void) | null>(null);
  const idFor = useRef(attackerIdForRound);

  useEffect(() => {
    idFor.current = attackerIdForRound;
  }, [attackerIdForRound]);

  useEffect(
    () => () => {
      // Read the ref at unmount: finish() swaps in a new array, so a mount-time capture would miss timers.
      timers.current.forEach(clearTimeout);
      timers.current = [];
      done.current = null;
    },
    []
  );

  const finish = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setPlaying(false);
    setHit(null);
    setDisplay(null);
    const cb = done.current;
    done.current = null;
    cb?.();
  }, []);

  const play = useCallback(
    (rounds: TacticalRound[], onDone: () => void) => {
      done.current = onDone;
      if (rounds.length === 0) return finish();
      setPlaying(true);
      const step = rounds.length > 1 ? AUTO_STEP_MS : HIT_MS;
      rounds.forEach((r, i) => {
        timers.current.push(
          setTimeout(() => {
            setHit(damageTo(r, idFor.current(r)));
            setDisplay({ attacker: r.attackerHpAfter, defender: r.defenderHpAfter });
          }, i * step)
        );
      });
      timers.current.push(setTimeout(finish, rounds.length * step));
    },
    [finish]
  );

  return { hit, display, playing, play, skip: finish };
}
