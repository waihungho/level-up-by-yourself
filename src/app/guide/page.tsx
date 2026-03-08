"use client";
import Link from "next/link";

const ROLE_INFO = [
  {
    name: "Future",
    color: "text-purple-400 border-purple-700",
    titles: "AI Robot, AI Brain, Cyborg, Quantum Hacker, Nanosmith, Starweaver",
    strengths: "Technical & Mental",
    desc: "High-tech agents from a future era. Excel at engineering, hacking, and cognitive tasks.",
  },
  {
    name: "Modern",
    color: "text-blue-400 border-blue-700",
    titles: "Developer, Doctor, Scientist, Engineer, Strategist, Analyst",
    strengths: "Mental & Social",
    desc: "Contemporary professionals. Well-rounded with strong analytical and interpersonal skills.",
  },
  {
    name: "Medieval",
    color: "text-amber-400 border-amber-700",
    titles: "Warrior, Magician, Necromancer, Shaman, Paladin, Alchemist",
    strengths: "Physical & Spiritual",
    desc: "Fantasy-era agents. Strong in combat, magic, and mystical arts.",
  },
];

const DIMENSION_CATEGORIES = [
  { name: "Physical", color: "text-red-400", examples: "Strength, Agility, Endurance, Speed..." },
  { name: "Mental", color: "text-blue-400", examples: "Intelligence, Wisdom, Focus, Creativity..." },
  { name: "Social", color: "text-green-400", examples: "Charisma, Leadership, Empathy, Diplomacy..." },
  { name: "Spiritual", color: "text-purple-400", examples: "Spirit, Meditation, Aura, Mysticism..." },
  { name: "Technical", color: "text-cyan-400", examples: "Engineering, Hacking, Crafting, Strategy..." },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-mono font-bold text-white mb-4 border-b border-gray-800 pb-2">{title}</h2>
      {children}
    </div>
  );
}

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white p-6 pb-24 max-w-2xl mx-auto">
      <Link href="/dashboard" className="text-sm text-gray-500 font-mono hover:text-gray-400 mb-6 block">
        &larr; Back to dashboard
      </Link>

      <h1 className="text-3xl font-mono font-bold mb-2">How to Play</h1>
      <p className="text-gray-400 font-mono mb-8">Everything you need to know about Level Up By Yourself.</p>

      {/* Getting Started */}
      <Section title="1. Getting Started">
        <div className="space-y-3 text-sm text-gray-300 font-mono">
          <div className="flex gap-3">
            <span className="text-cyan-400 shrink-0">01</span>
            <p>Connect your Solana wallet (Phantom or Solflare) to create your player account.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-cyan-400 shrink-0">02</span>
            <p>Head to the Summon page to create your first agent.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-cyan-400 shrink-0">03</span>
            <p>Complete daily tasks to raise your Ability Score, which boosts agent growth.</p>
          </div>
          <div className="flex gap-3">
            <span className="text-cyan-400 shrink-0">04</span>
            <p>Watch your agents grow every day and track their progress.</p>
          </div>
        </div>
      </Section>

      {/* Summoning Agents */}
      <Section title="2. Summoning Agents">
        <div className="space-y-3 text-sm text-gray-300 font-mono">
          <p>When summoning a new agent, you choose:</p>
          <ul className="list-none space-y-2 ml-4">
            <li><span className="text-cyan-400 mr-2">Name</span> - A unique name for your agent</li>
            <li><span className="text-cyan-400 mr-2">Role Category</span> - Future, Modern, or Medieval</li>
            <li><span className="text-cyan-400 mr-2">Role Title</span> - A specific role within the category</li>
            <li><span className="text-cyan-400 mr-2">Character</span> - Personality and traits</li>
            <li><span className="text-cyan-400 mr-2">Objective</span> - What the agent strives to achieve</li>
          </ul>
          <div className="bg-gray-900 border border-yellow-700/50 rounded p-3 mt-3">
            <p className="text-yellow-400 text-xs">Once created, an agent's name, character, and objective cannot be changed. Choose wisely.</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded p-3">
            <p className="text-gray-400 text-xs">Summon cooldown: You can summon one new agent every 7 days.</p>
          </div>
        </div>
      </Section>

      {/* Role Categories */}
      <Section title="3. Role Categories">
        <div className="space-y-3">
          {ROLE_INFO.map((r) => (
            <div key={r.name} className={`bg-gray-900 border rounded p-4 ${r.color}`}>
              <h3 className="font-mono font-bold mb-1">{r.name}</h3>
              <p className="text-sm text-gray-300 mb-2">{r.desc}</p>
              <p className="text-xs text-gray-500">Titles: {r.titles}</p>
              <p className="text-xs text-gray-500">Strengths: {r.strengths}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 50 Dimensions */}
      <Section title="4. The 50 Dimensions">
        <p className="text-sm text-gray-300 font-mono mb-4">
          Every agent has 50 ability dimensions spread across 5 categories (10 each).
          Initial values are weighted by the agent's role category.
        </p>
        <div className="space-y-2">
          {DIMENSION_CATEGORIES.map((cat) => (
            <div key={cat.name} className="bg-gray-900 border border-gray-800 rounded p-3 flex items-start gap-3">
              <span className={`font-mono font-bold text-sm shrink-0 w-20 ${cat.color}`}>{cat.name}</span>
              <span className="text-xs text-gray-400 font-mono">{cat.examples}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Daily Growth */}
      <Section title="5. Daily Growth">
        <div className="space-y-3 text-sm text-gray-300 font-mono">
          <p>Agents grow autonomously once per day. The growth system considers:</p>
          <ul className="list-none space-y-2 ml-4">
            <li><span className="text-cyan-400 mr-2">Role weights</span> - Each role favors certain dimension categories</li>
            <li><span className="text-cyan-400 mr-2">Player ability</span> - Higher ability score = faster growth</li>
            <li><span className="text-cyan-400 mr-2">Character & objective</span> - Influence which dimensions develop most</li>
          </ul>
          <div className="bg-gray-900 border border-gray-800 rounded p-3">
            <p className="text-gray-400 text-xs mb-2">Growth tiers based on your Ability Score:</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">0 - 49 points</span>
                <span className="text-gray-400">1.0x growth</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">50 - 149 points</span>
                <span className="text-yellow-400">1.5x growth</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">150+ points</span>
                <span className="text-green-400">2.0x growth</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Daily Tasks */}
      <Section title="6. Daily Tasks">
        <div className="space-y-3 text-sm text-gray-300 font-mono">
          <p>Complete daily tasks to earn Ability Points and boost your agents' growth rate.</p>
          <div className="bg-gray-900 border border-gray-800 rounded p-3">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Daily Login</span><span className="text-purple-400">+5 pts</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>View Agents</span><span className="text-purple-400">+3 pts</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Check Growth</span><span className="text-purple-400">+5 pts</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Read Narrative</span><span className="text-purple-400">+2 pts</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500">Tasks reset daily. Consistent play leads to faster agent growth.</p>
        </div>
      </Section>

      {/* Battle System */}
      <Section title="7. Battle System">
        <div className="space-y-3 text-sm text-gray-300 font-mono">
          <p>Challenge your own agents to friendly sparring matches in the Battle Arena and earn dimension growth as rewards.</p>

          <div className="bg-gray-900 border border-gray-800 rounded p-4">
            <h3 className="text-cyan-400 font-bold mb-2">How It Works</h3>
            <ul className="list-none space-y-2 ml-4">
              <li><span className="text-cyan-400 mr-2">Turn-based</span> - Combat plays out in turns with a random category each round</li>
              <li><span className="text-cyan-400 mr-2">Speed</span> - Determines which agent attacks first each turn</li>
              <li><span className="text-cyan-400 mr-2">HP</span> - Based on the agent's total dimension values across all 50 dimensions</li>
            </ul>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded p-4">
            <h3 className="text-green-400 font-bold mb-2">Rewards</h3>
            <p className="mb-2">Both agents earn dimension growth from battle — win or lose.</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-yellow-400">Winner</span>
                <span className="text-gray-400">+1.0–2.0 to 3 random dimensions</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Loser</span>
                <span className="text-gray-400">+0.5–1.0 to 2 random dimensions</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded p-4">
            <h3 className="text-purple-400 font-bold mb-2">Stamina</h3>
            <p>Each agent can fight <span className="text-white">3 times per day</span>. Stamina resets at midnight UTC.</p>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded p-4">
            <h3 className="text-amber-400 font-bold mb-2">Role Advantages</h3>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-amber-400">Medieval</span>
                <span className="text-gray-400">+10% Physical damage</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-purple-400">Future</span>
                <span className="text-gray-400">+10% Technical damage</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-blue-400">Modern</span>
                <span className="text-gray-400">+10% Mental damage</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Tips */}
      <Section title="8. Tips">
        <div className="space-y-2 text-sm text-gray-300 font-mono">
          <div className="flex gap-2">
            <span className="text-yellow-400 shrink-0">*</span>
            <p>Complete all daily tasks every day to maximize your Ability Score.</p>
          </div>
          <div className="flex gap-2">
            <span className="text-yellow-400 shrink-0">*</span>
            <p>Write detailed characters and objectives — they influence growth direction.</p>
          </div>
          <div className="flex gap-2">
            <span className="text-yellow-400 shrink-0">*</span>
            <p>Diversify your team with agents from different role categories.</p>
          </div>
          <div className="flex gap-2">
            <span className="text-yellow-400 shrink-0">*</span>
            <p>Check the radar chart to see your agent's overall dimension balance.</p>
          </div>
          <div className="flex gap-2">
            <span className="text-yellow-400 shrink-0">*</span>
            <p>Each agent is unique and immutable — plan your team composition carefully.</p>
          </div>
        </div>
      </Section>
    </main>
  );
}
