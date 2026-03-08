import { describe, it, expect } from "vitest";
import { isSupabaseConfigured, getSupabase } from "../supabase";

describe("supabase", () => {
  it("returns null when not configured", () => {
    expect(getSupabase()).toBeNull();
  });

  it("reports not configured without env vars", () => {
    expect(isSupabaseConfigured).toBe(false);
  });
});
