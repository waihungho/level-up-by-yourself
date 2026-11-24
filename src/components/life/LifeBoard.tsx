"use client";
import { useCallback, useEffect, useState } from "react";
import { DIMENSIONS } from "@/lib/constants";
import type { SessionKind } from "@/lib/life/catalog";
import type { DimensionCategory } from "@/lib/types";
import { CapBar, HabitsCard, QuestsCard, SessionsCard, StepsCard } from "./LifeSections";
import { LIFE_ERRORS, sendJson, type LifeHabit, type LifeQuestItem, type LifeView } from "./types";

const GENERIC_ERROR = "Something went wrong. Please try again.";

function growthText(growth: Record<string, number>): string {
  return Object.entries(growth)
    .map(([id, v]) => `${DIMENSIONS.find((d) => d.id === Number(id))?.name ?? id} +${v}`)
    .join(", ");
}

interface LifeBoardProps {
  walletAddress: string;
  /** Called after growth was granted, so the caller can refresh agent stats. */
  onGrowth?: () => void;
}

export function LifeBoard({ walletAddress, onGrowth }: LifeBoardProps) {
  const [view, setView] = useState<LifeView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  /** Server clock minus device clock, so the timer matches the server's finish check. */
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/life?wallet=${encodeURIComponent(walletAddress)}`);
      if (!res.ok) return setLoadError(true);
      const data = (await res.json()) as LifeView;
      setOffset(Date.parse(data.serverNow) - Date.now());
      setView(data);
      setAgentId((cur) => (cur && data.agents.some((a) => a.id === cur) ? cur : (data.openSession?.agentId ?? data.agents[0]?.id ?? null)));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [walletAddress]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    refresh();
  }, [refresh]);

  // Tick only while a session timer is showing.
  const timing = !!view?.openSession;
  useEffect(() => {
    if (!timing) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timing]);

  /** Runs one request; shows the granted growth or the error, then reloads the view. */
  const act = useCallback(
    async (method: "POST" | "PATCH" | "DELETE", url: string, body: Record<string, unknown>, success?: string) => {
      setBusy(true);
      setMessage(null);
      const r = await sendJson(method, url, { walletAddress, ...body });
      if (r.ok) {
        const growth = r.data.growth as Record<string, number> | undefined;
        if (growth && Object.keys(growth).length) {
          setMessage({ text: `+${r.data.granted} pts → ${growthText(growth)}`, good: true });
          onGrowth?.();
        } else if (r.data.result === "cap") {
          setMessage({ text: LIFE_ERRORS.daily_cap, good: false });
        } else if (success) {
          setMessage({ text: success, good: true });
        }
      } else {
        setMessage({ text: LIFE_ERRORS[r.data.error as string] ?? GENERIC_ERROR, good: false });
      }
      await refresh();
      setBusy(false);
      return r.ok;
    },
    [walletAddress, refresh, onGrowth]
  );

  if (loadError && !view) {
    return (
      <p className="font-mono text-sm text-red-400">
        Couldn&apos;t load Real Life.{" "}
        <button className="underline" onClick={refresh}>
          Retry
        </button>
      </p>
    );
  }
  if (!view) return <p className="font-mono text-sm text-gray-500">Loading…</p>;
  if (!view.agents.length) return <p className="font-mono text-sm text-gray-400">Summon an agent first. Your real-life progress grows it.</p>;

  const onCheck = (h: LifeHabit) => act("POST", "/api/life/checkin", { agentId, kind: "habit", habitId: h.id });
  const onQuest = (q: LifeQuestItem) => act("POST", "/api/life/checkin", { agentId, kind: "quest", questId: q.id });
  const onSteps = (steps: number) => act("POST", "/api/life/checkin", { agentId, kind: "steps", steps });
  const onAdd = (name: string, category: DimensionCategory) => act("POST", "/api/life/habits", { name, category }, "Habit added.");
  const onRemove = (h: LifeHabit) => act("DELETE", "/api/life/habits", { habitId: h.id }, "Habit removed.");
  const onStart = (kind: SessionKind) => act("POST", "/api/life/session", { agentId, kind });
  const onFinish = () => act("PATCH", "/api/life/session", { sessionId: view.openSession?.id });
  const onCancel = () => act("PATCH", "/api/life/session", { sessionId: view.openSession?.id, cancel: true }, "Session cancelled.");

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 font-mono text-xs text-gray-400">
        Growth goes to
        <select
          value={agentId ?? ""}
          onChange={(e) => setAgentId(e.target.value)}
          disabled={!!view.openSession}
          className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white"
        >
          {view.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.roleTitle})
            </option>
          ))}
        </select>
      </label>

      <CapBar points={view.todayPoints} cap={view.cap} streak={view.streak} />

      <div aria-live="polite" className="min-h-[1rem]">
        {message && <p className={`font-mono text-xs ${message.good ? "text-green-300" : "text-amber-300"}`}>{message.text}</p>}
      </div>

      <SessionsCard open={view.openSession} now={now + offset} busy={busy} onStart={onStart} onFinish={onFinish} onCancel={onCancel} />
      <QuestsCard quests={view.quests} busy={busy} onDone={onQuest} />
      <HabitsCard habits={view.habits} maxHabits={view.maxHabits} busy={busy} onCheck={onCheck} onAdd={onAdd} onRemove={onRemove} />
      <StepsCard stepsPoints={view.stepsToday} busy={busy} onLog={onSteps} />
    </div>
  );
}
