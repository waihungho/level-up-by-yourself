"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

/** Bump when announcing a new release so the banner shows again for everyone. */
const RELEASE = "2026-11-real-life-story";
const STORAGE_KEY = `whats_new_dismissed_${RELEASE}`;

const FEATURES = [
  { href: "/life", icon: "☀️", title: "Real Life", text: "Habits, daily quests, focus and meditation timers and steps: level yourself up and your agent grows too." },
  { href: "/story", icon: "📜", title: "Story & Events", text: "A 12-stage campaign across three eras, plus seasonal events. Harvest Moon is live now!" },
  { href: "/agents", icon: "✦", title: "Class Evolution & Signature Moves", text: "Evolve agents into Paladins, Archons and more, and unlock a signature special at 200 in any stat." },
  { href: "/summon", icon: "✨", title: "Shiny Agents", text: "1 in 64 summons is a shiny, with a rare colour scheme and sparkle." },
];

export function WhatsNewBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // storage unavailable: show the banner
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setVisible(!dismissed);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // storage unavailable: hides for this visit only
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section className="relative mb-4 rounded-lg border border-purple-600/50 bg-gradient-to-br from-purple-950/70 to-gray-900 p-4" aria-label="What's new">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss what's new"
        className="absolute top-1 right-1 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-white font-mono"
      >
        ×
      </button>
      <h2 className="font-mono text-sm font-bold text-purple-200 mb-2">✨ What&apos;s new</h2>
      <ul className="space-y-2">
        {FEATURES.map((f) => (
          <li key={f.href}>
            <Link href={f.href} className="flex gap-2 items-start rounded px-1 py-0.5 hover:bg-white/5">
              <span className="text-base leading-5" aria-hidden="true">
                {f.icon}
              </span>
              <span className="font-mono text-xs">
                <span className="font-bold text-white">{f.title}</span>
                <span className="text-gray-400"> — {f.text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
