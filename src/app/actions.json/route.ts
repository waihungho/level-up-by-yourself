import { actionJson, actionOptions } from "@/lib/blinks/actions";

/** Maps shareable /challenge/<agentId> pages to their Actions API, so Blink clients unfurl them. */
export function GET() {
  return actionJson({
    rules: [
      { pathPattern: "/challenge/*", apiPath: "/api/actions/challenge/*" },
      // Idempotent rule: lets clients detect that the API paths themselves are Actions.
      { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
    ],
  });
}

export const OPTIONS = actionOptions;
