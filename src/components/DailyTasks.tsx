"use client";
import { useState, useEffect, useCallback } from "react";
import { useGame } from "@/components/GameProvider";
import { DAILY_TASKS } from "@/lib/constants";
import { completeTask, getCompletedTasksToday } from "@/lib/db";

export function DailyTasks() {
  const { player, refreshPlayer } = useGame();
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [completing, setCompleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCompleted = useCallback(async () => {
    if (!player) return;
    try {
      const completed = await getCompletedTasksToday(player.id);
      setCompletedTasks(completed);
    } catch {
      // ignore load errors
    }
  }, [player]);

  useEffect(() => {
    loadCompleted();
  }, [loadCompleted]);

  const handleComplete = async (taskName: string) => {
    if (!player || completedTasks.includes(taskName)) return;
    setCompleting(taskName);
    setError(null);
    try {
      await completeTask(player.id, taskName);
      setCompletedTasks((prev) => [...prev, taskName]);
      await refreshPlayer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete task");
    } finally {
      setCompleting(null);
    }
  };

  if (!player) return null;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded p-4">
      <h2 className="text-lg font-mono font-bold text-white mb-4">Daily Tasks</h2>
      {error && <p className="text-red-400 text-xs font-mono mb-2">{error}</p>}
      <div className="space-y-2">
        {DAILY_TASKS.map((task) => {
          const done = completedTasks.includes(task.name);
          return (
            <button
              key={task.name}
              onClick={() => handleComplete(task.name)}
              disabled={done || completing === task.name}
              className={`w-full flex items-center justify-between p-3 rounded font-mono text-sm transition-colors ${
                done
                  ? "bg-gray-800 text-gray-600 cursor-default"
                  : "bg-gray-800 hover:bg-gray-700 text-white cursor-pointer"
              }`}
            >
              <div className="flex items-center gap-3">
                <span>{completing === task.name ? "..." : done ? "\u2713" : "\u25CB"}</span>
                <div className="text-left">
                  <div>{task.name}</div>
                  <div className="text-xs text-gray-500">{task.description}</div>
                </div>
              </div>
              <span className="text-purple-400">+{task.abilityPoints}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
