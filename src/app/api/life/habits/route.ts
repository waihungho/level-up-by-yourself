import type { NextRequest } from "next/server";
import { missingFields, readJson, respond } from "@/lib/api-route";
import { addHabit, removeHabit } from "@/lib/life/life-service";

export async function POST(req: NextRequest) {
  const body = await readJson<Parameters<typeof addHabit>[0]>(req);
  if (!body) return missingFields();
  return respond("life/habits POST", () => addHabit(body));
}

export async function DELETE(req: NextRequest) {
  const body = await readJson<Parameters<typeof removeHabit>[0]>(req);
  if (!body) return missingFields();
  return respond("life/habits DELETE", () => removeHabit(body));
}
