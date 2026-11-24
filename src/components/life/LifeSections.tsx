import { useState } from "react";
import { CATEGORIES, HABIT_NAME_MAX, SESSIONS, STEPS_PER_POINT, STEPS_MAX_POINTS, type SessionKind } from "@/lib/life/catalog";
import type { DimensionCategory } from "@/lib/types";
import { CATEGORY_COLOR, type LifeHabit, type LifeOpenSession, type LifeQuestItem } from "./types";

const card = "bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3";
const heading = "font-mono text-sm font-bold text-white";
const button = "px-3 py-1.5 rounded font-mono text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export function CapBar({ points, cap, streak }: { points: number; cap: number; streak: number }) {
  const pct = Math.min(100, Math.round((points / cap) * 100));
  return (
    <div className={card}>
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="text-gray-400">Today&apos;s real-life growth</span>
        <span className="text-amber-300 font-bold">
          {points} / {cap} pts
        </span>
      </div>
      <div className="h-2 bg-gray-800 rounded" role="progressbar" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={points} aria-label="Today's real-life growth">
        <div className="h-2 bg-amber-400 rounded transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="font-mono text-[11px] text-gray-500">{streak > 0 ? `🔥 ${streak}-day streak of doing something real` : "Do one thing today to start a streak."}</p>
    </div>
  );
}

export function HabitsCard({
  habits,
  maxHabits,
  busy,
  onCheck,
  onAdd,
  onRemove,
}: {
  habits: LifeHabit[];
  maxHabits: number;
  busy: boolean;
  onCheck: (h: LifeHabit) => void;
  onAdd: (name: string, category: DimensionCategory) => Promise<boolean>;
  onRemove: (h: LifeHabit) => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DimensionCategory>("Physical");

  return (
    <section className={card} aria-labelledby="habits-h">
      <h2 id="habits-h" className={heading}>
        Habits <span className="text-gray-500 font-normal">({habits.length}/{maxHabits})</span>
      </h2>
      <p className="font-mono text-[11px] text-gray-500">Check in once a day. Each day in a row adds +10% (up to +50%).</p>
      {habits.length === 0 && <p className="font-mono text-xs text-gray-400">No habits yet. Add one below.</p>}
      <ul className="space-y-2">
        {habits.map((h) => (
          <li key={h.id} className="flex items-center gap-2">
            <button
              className={`${button} ${h.checkedToday ? "bg-green-800 text-green-200" : "bg-purple-600 hover:bg-purple-700 text-white"}`}
              disabled={busy || h.checkedToday}
              onClick={() => onCheck(h)}
              aria-label={h.checkedToday ? `${h.name} done today` : `Check in ${h.name}`}
            >
              {h.checkedToday ? "✓" : "Do"}
            </button>
            <span className="flex-1 min-w-0 font-mono text-xs truncate">
              {h.name} <span className={CATEGORY_COLOR[h.category]}>· {h.category}</span>
            </span>
            <span className="font-mono text-[11px] text-amber-300 whitespace-nowrap">{h.streak > 0 ? `🔥${h.streak}` : ""} +{h.nextPoints}</span>
            <button className="font-mono text-xs text-gray-500 hover:text-red-400 px-1" onClick={() => onRemove(h)} disabled={busy} aria-label={`Remove ${h.name}`}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {habits.length < maxHabits && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onAdd(name.trim(), category)) setName("");
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={HABIT_NAME_MAX}
            placeholder="e.g. Morning run"
            aria-label="New habit name"
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 font-mono text-xs text-white"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as DimensionCategory)}
            aria-label="Habit category"
            className="bg-gray-800 border border-gray-700 rounded px-1 font-mono text-xs text-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button type="submit" className={`${button} bg-gray-700 hover:bg-gray-600 text-white`} disabled={busy || !name.trim()}>
            Add
          </button>
        </form>
      )}
    </section>
  );
}

export function QuestsCard({ quests, busy, onDone }: { quests: LifeQuestItem[]; busy: boolean; onDone: (q: LifeQuestItem) => void }) {
  return (
    <section className={card} aria-labelledby="quests-h">
      <h2 id="quests-h" className={heading}>
        Today&apos;s real-life quests
      </h2>
      <ul className="space-y-2">
        {quests.map((q) => (
          <li key={q.id} className="flex items-center gap-2">
            <button
              className={`${button} ${q.done ? "bg-green-800 text-green-200" : "bg-amber-600 hover:bg-amber-700 text-white"}`}
              disabled={busy || q.done}
              onClick={() => onDone(q)}
              aria-label={q.done ? `${q.text} done` : `Mark done: ${q.text}`}
            >
              {q.done ? "✓" : "Done"}
            </button>
            <span className="flex-1 font-mono text-xs">{q.text}</span>
            <span className={`font-mono text-[11px] ${CATEGORY_COLOR[q.category]}`}>+{q.points}</span>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[11px] text-gray-500">New quests every day at 00:00 UTC. Honor system: be honest with yourself.</p>
    </section>
  );
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function SessionsCard({
  open,
  now,
  busy,
  onStart,
  onFinish,
  onCancel,
}: {
  open: LifeOpenSession | null;
  /** Device time corrected to the server clock. */
  now: number;
  busy: boolean;
  onStart: (kind: SessionKind) => void;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const left = open ? Date.parse(open.startedAt) + open.minutes * 60_000 - now : 0;
  return (
    <section className={card} aria-labelledby="sessions-h">
      <h2 id="sessions-h" className={heading}>
        Focus &amp; meditation
      </h2>
      {open ? (
        <div className="text-center space-y-3">
          <p className="font-mono text-xs text-gray-400">{SESSIONS[open.kind].label} session</p>
          <p className="font-mono text-4xl font-bold text-white" aria-live="off">
            {left > 0 ? mmss(left) : "Done!"}
          </p>
          <p className="font-mono text-[11px] text-gray-500">Keep this page open. Phone away, eyes off the screen.</p>
          <div className="flex justify-center gap-2">
            <button className={`${button} bg-green-600 hover:bg-green-700 text-white`} disabled={busy || left > 0} onClick={onFinish}>
              Claim +{SESSIONS[open.kind].points} {SESSIONS[open.kind].category}
            </button>
            <button className={`${button} bg-gray-700 hover:bg-gray-600 text-white`} disabled={busy} onClick={onCancel}>
              Give up
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(SESSIONS) as SessionKind[]).map((k) => (
            <button key={k} className={`${button} bg-indigo-700 hover:bg-indigo-600 text-white py-3`} disabled={busy} onClick={() => onStart(k)}>
              {k === "focus" ? "🎯" : "🧘"} {SESSIONS[k].label} {SESSIONS[k].minutes} min
              <span className="block font-normal text-[10px] text-indigo-200">
                +{SESSIONS[k].points} {SESSIONS[k].category}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function StepsCard({ stepsPoints, busy, onLog }: { stepsPoints: number | null; busy: boolean; onLog: (steps: number) => void }) {
  const [steps, setSteps] = useState("");
  return (
    <section className={card} aria-labelledby="steps-h">
      <h2 id="steps-h" className={heading}>
        Steps
      </h2>
      {stepsPoints !== null ? (
        <p className="font-mono text-xs text-green-300">✓ Logged today (+{stepsPoints} Physical)</p>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onLog(Number(steps));
          }}
        >
          <input
            value={steps}
            onChange={(e) => setSteps(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Today's steps"
            aria-label="Today's steps"
            className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded px-2 py-1 font-mono text-xs text-white"
          />
          <button type="submit" className={`${button} bg-red-700 hover:bg-red-600 text-white`} disabled={busy || !steps}>
            Log
          </button>
        </form>
      )}
      <p className="font-mono text-[11px] text-gray-500">
        +1 Physical per {STEPS_PER_POINT.toLocaleString()} steps, up to +{STEPS_MAX_POINTS}. Once a day.
      </p>
    </section>
  );
}
