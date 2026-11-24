"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { activeEvents } from "@/lib/events/calendar";

const HOUR = 3_600_000;
const noSubscribe = () => () => {};
/** The current hour (stable between renders); 0 on the server, where the banner isn't rendered. */
const currentHour = () => Math.floor(Date.now() / HOUR) * HOUR;

/** Banner for the running seasonal event (if any), linking to its stages. Client only: it depends on today's date. */
export function EventBanner() {
  const now = useSyncExternalStore(noSubscribe, currentHour, () => 0);
  if (!now) return null;
  const [event] = activeEvents(new Date(now));
  if (!event) return null;
  const days = Math.max(1, Math.ceil((Date.parse(event.endsAt) - now) / 86_400_000));
  return (
    <Link href="/story" className={`block mb-4 rounded-lg border p-3 hover:brightness-125 ${event.def.theme}`}>
      <p className="font-mono text-sm font-bold">
        {event.def.emoji} {event.def.name} is live! <span className="font-normal text-xs">({days} day{days === 1 ? "" : "s"} left)</span>
      </p>
      <p className="font-mono text-[11px]">{event.def.tagline} Fight the event stages for gems and stats →</p>
    </Link>
  );
}
