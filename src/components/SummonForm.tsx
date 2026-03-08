"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { generateInitialDimensions, generateSpriteSeed } from "@/lib/agent-init";
import { summonAgent } from "@/lib/db";
import { ROLE_WEIGHTS } from "@/lib/constants";
import type { RoleCategory, DimensionCategory } from "@/lib/types";

const ROLE_OPTIONS: { value: RoleCategory; label: string }[] = [
  { value: "future", label: "Future" },
  { value: "modern", label: "Modern" },
  { value: "medieval", label: "Medieval" },
];

const ROLE_TITLES: Record<RoleCategory, string[]> = {
  future: [
    "AI Robot", "AI Brain", "Cyborg", "Quantum Hacker", "Nanosmith", "Starweaver",
    "Synthoid", "Void Pilot", "Data Wraith", "Chrono Agent", "Plasma Sage", "Neuro Link",
  ],
  modern: [
    "Developer", "Doctor", "Scientist", "Engineer", "Strategist", "Analyst",
    "Architect", "Hacker", "Professor", "Diplomat", "Journalist", "Trader",
  ],
  medieval: [
    "Warrior", "Magician", "Necromancer", "Shaman", "Paladin", "Alchemist",
    "Ranger", "Druid", "Berserker", "Sorcerer", "Monk", "Assassin",
  ],
};

const WEIGHT_DISPLAY: Record<string, string> = {
  high: "\u2191\u2191",
  medium: "\u2191",
  low: "\u2193",
};

const CATEGORY_ORDER: DimensionCategory[] = ["Mental", "Technical", "Social", "Physical", "Spiritual"];

export function SummonForm() {
  const router = useRouter();
  const { player, refreshAgents } = useGame();

  const [name, setName] = useState("");
  const [role, setRole] = useState<RoleCategory | null>(null);
  const [roleTitle, setRoleTitle] = useState("");
  const [character, setCharacter] = useState("");
  const [objective, setObjective] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!player || !role) return;

    setSubmitting(true);
    setError(null);

    try {
      const initialDimensions = generateInitialDimensions(role);
      const spriteSeed = generateSpriteSeed(role, name, character);

      const agent = await summonAgent({
        playerId: player.id,
        name: name.trim(),
        role,
        roleTitle: roleTitle.trim(),
        character: character.trim(),
        objective: objective.trim(),
        spriteSeed,
        initialDimensions,
      });

      await refreshAgents();
      router.push(`/agents/${agent.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to summon agent. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 font-mono">
      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm text-gray-400 mb-1">
          Name
        </label>
        <input
          id="name"
          type="text"
          required
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
          placeholder="Agent name"
        />
      </div>

      {/* Role Category */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Role Category</label>
        <div className="grid grid-cols-3 gap-3">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setRole(opt.value); setRoleTitle(""); }}
              className={`px-4 py-3 rounded border text-center transition-colors ${
                role === opt.value
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                  : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Role weight preview */}
        {role && (
          <div className="mt-3 p-3 bg-gray-900 border border-gray-800 rounded text-sm text-gray-400">
            <span className="text-gray-500 mr-2">{role.charAt(0).toUpperCase() + role.slice(1)}:</span>
            {CATEGORY_ORDER.map((cat) => (
              <span key={cat} className="mr-3">
                {cat} {WEIGHT_DISPLAY[ROLE_WEIGHTS[role][cat]]}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Role Title */}
      {role && (
        <div>
          <label className="block text-sm text-gray-400 mb-2">Role Title</label>
          <div className="grid grid-cols-4 gap-2">
            {ROLE_TITLES[role].map((title) => (
              <button
                key={title}
                type="button"
                onClick={() => setRoleTitle(title)}
                className={`px-3 py-2 rounded border text-sm text-center transition-colors ${
                  roleTitle === title
                    ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                    : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-500"
                }`}
              >
                {title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Character */}
      <div>
        <label htmlFor="character" className="block text-sm text-gray-400 mb-1">
          Character
        </label>
        <textarea
          id="character"
          required
          maxLength={500}
          value={character}
          onChange={(e) => setCharacter(e.target.value)}
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 resize-none"
          placeholder="Describe your agent's personality and traits..."
        />
      </div>

      {/* Objective */}
      <div>
        <label htmlFor="objective" className="block text-sm text-gray-400 mb-1">
          Objective
        </label>
        <textarea
          id="objective"
          required
          maxLength={500}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500 resize-none"
          placeholder="What does your agent strive to achieve?"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !name.trim() || !role || !roleTitle.trim() || !character.trim() || !objective.trim()}
        className="w-full py-3 rounded font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-cyan-600 hover:bg-cyan-500 text-white"
      >
        {submitting ? "Summoning..." : "Summon Agent"}
      </button>
    </form>
  );
}
