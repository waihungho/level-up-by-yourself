/*
 * URLs for Blink challenges. Client-safe (no server imports). `origin` is the site origin:
 * `window.location.origin` on the client, the request URL's origin on the server.
 */

export function challengePageUrl(origin: string, agentId: string): string {
  return `${origin}/challenge/${agentId}`;
}

export function challengeActionUrl(origin: string, agentId: string): string {
  return `${origin}/api/actions/challenge/${agentId}`;
}

export function challengeResultUrl(origin: string, agentId: string): string {
  return `${challengeActionUrl(origin, agentId)}/result`;
}

export function agentAvatarUrl(origin: string, agentId: string): string {
  return `${origin}/api/agents/${agentId}/avatar`;
}

/** Opens the Action as a Blink on dial.to (works before the Dialect registry knows the domain). */
export function dialToUrl(origin: string, agentId: string): string {
  return `https://dial.to/?action=solana-action:${encodeURIComponent(challengeActionUrl(origin, agentId))}`;
}

export function xIntentUrl(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function shareText(agentName: string): string {
  return `Think you can beat my agent ${agentName}? Fight it in Level Up ⚔`;
}
