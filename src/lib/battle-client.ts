/** Client helper for POST /api/battle/start; resolves to the session payload or an error code. */
export async function postStart<T>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/battle/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "internal" };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "network" };
  }
}

export const GENERIC_START_ERROR = "Something went wrong. Please try again.";
export const NETWORK_ERROR = "Network error. Please try again.";
