"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/components/GameProvider";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import Link from "next/link";

export default function Home() {
  const { player } = useGame();
  const router = useRouter();

  useEffect(() => {
    if (player) router.push("/dashboard");
  }, [player, router]);

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl md:text-6xl font-mono font-bold mb-4 text-center">
        Level Up By Yourself
      </h1>
      <p className="text-gray-400 font-mono text-lg mb-12 text-center max-w-md">
        Summon unique AI agents. Watch them grow. Build your team.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 max-w-2xl">
        {[
          { title: "50 Dimensions", desc: "Each agent has 50 unique ability dimensions" },
          { title: "Daily Growth", desc: "Agents grow autonomously every day" },
          { title: "Unique Agents", desc: "Every agent is one-of-a-kind with procedural pixel art" },
        ].map((f) => (
          <div key={f.title} className="bg-gray-900 border border-gray-800 rounded p-4 text-center">
            <h3 className="font-mono font-bold text-purple-400 mb-2">{f.title}</h3>
            <p className="text-sm text-gray-500">{f.desc}</p>
          </div>
        ))}
      </div>

      <WalletConnectButton />

      {player && (
        <Link
          href="/dashboard"
          className="mt-6 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-mono text-lg rounded transition-colors"
        >
          Enter Game →
        </Link>
      )}
    </main>
  );
}
