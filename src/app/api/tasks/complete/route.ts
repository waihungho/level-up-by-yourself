import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { completeDailyTask } from "@/lib/summon-service";

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof completeDailyTask>[0]>(req);
  if (!body) return missingFields();
  return respond("tasks/complete", () => completeDailyTask(body));
}
