"use client";
import { useCallback, useEffect, useState } from "react";

const SHOW_MS = 3500;
const key = (bossId: string) => `raid_slain_seen_${bossId}`;

function seen(bossId: string): boolean {
  try {
    return localStorage.getItem(key(bossId)) === "1";
  } catch {
    return false;
  }
}

/** Full-screen kill cinematic, shown once per boss per device (remembered when it closes). */
export function SlainOverlay({ bossId, bossName }: { bossId: string; bossName: string }) {
  const [show, setShow] = useState(false);

  const close = useCallback(() => {
    try {
      localStorage.setItem(key(bossId), "1");
    } catch {
      // storage unavailable: it may show again next time
    }
    setShow(false);
  }, [bossId]);

  useEffect(() => {
    if (seen(bossId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setShow(true);
    const t = setTimeout(close, SHOW_MS);
    return () => clearTimeout(t);
  }, [bossId, close]);

  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center animate-fadeIn" role="status">
      <p className="font-mono text-5xl font-black text-yellow-400 animate-vsSlam">SLAIN</p>
      <p className="font-mono text-sm text-gray-300 mt-2 px-6 text-center">{bossName} has fallen. Rewards are on their way.</p>
      <button type="button" onClick={close} className="mt-6 px-5 py-2 min-h-[44px] rounded bg-yellow-600 text-black font-mono font-bold text-sm">
        Continue
      </button>
    </div>
  );
}
