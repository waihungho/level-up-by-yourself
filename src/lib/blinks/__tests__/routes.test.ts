// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { getOrCreatePlayer, getPlayerAgents } from "@/lib/db";
import * as challengeRoute from "@/app/api/actions/challenge/[agentId]/route";
import * as resultRoute from "@/app/api/actions/challenge/[agentId]/result/route";
import * as actionsJson from "@/app/actions.json/route";
import { GET as avatarGET } from "@/app/api/agents/[id]/avatar/route";

const BASE = "https://levelup.test";
const MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const ctx = (agentId: string) => ({ params: Promise.resolve({ agentId }) });

function expectActionHeaders(res: Response, chainId = MAINNET) {
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-methods")).toBe("GET,POST,PUT,OPTIONS");
  expect(res.headers.get("access-control-allow-headers")).toContain("Content-Type");
  expect(res.headers.get("access-control-expose-headers")).toBe("X-Action-Version, X-Blockchain-Ids");
  expect(res.headers.get("x-action-version")).toBe("2.4");
  expect(res.headers.get("x-blockchain-ids")).toBe(chainId);
}

async function demoAgentId(): Promise<string> {
  const player = await getOrCreatePlayer("routes-" + crypto.randomUUID());
  return (await getPlayerAgents(player.id))[0].id;
}

afterEach(() => vi.unstubAllEnvs());

describe("Actions routes", () => {
  it("GET sends the action with CORS/spec headers and a short CDN cache", async () => {
    const id = await demoAgentId();
    const res = await challengeRoute.GET(new NextRequest(`${BASE}/api/actions/challenge/${id}`), ctx(id));
    expect(res.status).toBe(200);
    expectActionHeaders(res);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=600");
    expect((await res.json()).type).toBe("action");
  });

  it("errors carry the headers too, and only GET is cached", async () => {
    const get = await challengeRoute.GET(new NextRequest(`${BASE}/api/actions/challenge/nope`), ctx("nope"));
    expect(get.status).toBe(404);
    expectActionHeaders(get);
    expect(get.headers.get("cache-control") ?? "").not.toContain("s-maxage");

    const post = await challengeRoute.POST(new NextRequest(`${BASE}/api/actions/challenge/x`, { method: "POST", body: JSON.stringify({ account: "bad" }) }), ctx("x"));
    expect(post.status).toBe(400);
    expectActionHeaders(post);
    expect(post.headers.get("cache-control") ?? "").not.toContain("s-maxage");

    const result = await resultRoute.POST(new NextRequest(`${BASE}/api/actions/challenge/x/result`, { method: "POST", body: "garbage" }), ctx("x"));
    expect(result.status).toBe(400);
    expectActionHeaders(result);
  });

  it("OPTIONS answers preflight on every Actions route", async () => {
    for (const res of [challengeRoute.OPTIONS(), resultRoute.OPTIONS(), actionsJson.OPTIONS()]) {
      expect(res.status).toBe(200);
      expectActionHeaders(res);
    }
  });

  it("actions.json maps challenge pages to the Actions API", async () => {
    const res = actionsJson.GET();
    expectActionHeaders(res);
    expect(await res.json()).toEqual({
      rules: [
        { pathPattern: "/challenge/*", apiPath: "/api/actions/challenge/*" },
        { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" },
      ],
    });
  });

  it("BLINK_CLUSTER switches the advertised chain", () => {
    vi.stubEnv("BLINK_CLUSTER", "devnet");
    expectActionHeaders(actionsJson.GET(), "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");
  });

  it("uses NEXT_PUBLIC_SITE_URL as the origin when set", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://canonical.example/");
    const id = await demoAgentId();
    const body = await (await challengeRoute.GET(new NextRequest(`${BASE}/api/actions/challenge/${id}`), ctx(id))).json();
    expect(body.icon).toBe(`https://canonical.example/api/agents/${id}/avatar`);
  });
});

describe("avatar route", () => {
  const actx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("404s a non-UUID id with a short cache (never 500)", async () => {
    const res = await avatarGET(new NextRequest(`${BASE}/api/agents/'; drop/avatar`), actx("'; drop"));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toContain("s-maxage=300");
  });

  it("404s an unknown agent with the same cache", async () => {
    const id = crypto.randomUUID();
    const res = await avatarGET(new NextRequest(`${BASE}/api/agents/${id}/avatar`), actx(id));
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toContain("s-maxage=300");
  });

  it("redirects query strings to the bare path", async () => {
    const id = crypto.randomUUID();
    const res = await avatarGET(new NextRequest(`${BASE}/api/agents/${id}/avatar?bust=1`), actx(id));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(`${BASE}/api/agents/${id}/avatar`);
  });

  it("renders a PNG cached for a day", async () => {
    const id = await demoAgentId();
    const res = await avatarGET(new NextRequest(`${BASE}/api/agents/${id}/avatar`), actx(id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400, s-maxage=86400");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });
});
