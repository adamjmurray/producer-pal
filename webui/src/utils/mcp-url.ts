// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

const VITE_DEV_PORT = "5173";
const DEFAULT_MCP_PORT = "3350";
const DEFAULT_MCP_URL = `http://localhost:${DEFAULT_MCP_PORT}/mcp`;

/**
 * Whether the page is served from the Vite dev server (port 5173).
 * @returns {boolean} True if on Vite dev server
 */
export function isViteDevServer(): boolean {
  return (
    typeof window !== "undefined" && window.location.port === VITE_DEV_PORT
  );
}

/**
 * Detects whether a connection failure is due to CORS blocking.
 * Uses a no-cors fetch to check if the server is reachable despite CORS.
 * @param url - The URL that failed to connect
 * @returns {Promise<boolean>} True if the server is reachable but CORS is blocking
 */
export async function detectCorsBlock(url: string): Promise<boolean> {
  try {
    await fetch(url, { mode: "no-cors" });

    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the config endpoint URL based on the MCP URL.
 * @returns {string} The config endpoint URL
 */
export function getConfigUrl(): string {
  return getMcpUrl().replace(/\/mcp$/, "/config");
}

/**
 * Gets the global-context endpoint URL (the machine-global ~/.producer-pal
 * context, distinct from the per-project /config project context).
 * @returns {string} The global-context endpoint URL
 */
export function getGlobalContextUrl(): string {
  return getMcpUrl().replace(/\/mcp$/, "/global-context");
}

/**
 * Gets the system-prompt endpoint URL (the machine-global ~/.producer-pal
 * custom system prompt that replaces the built-in instruction when non-empty).
 * @returns {string} The system-prompt endpoint URL
 */
export function getSystemPromptUrl(): string {
  return getMcpUrl().replace(/\/mcp$/, "/system-prompt");
}

/**
 * Gets the skill-overrides collection endpoint URL (lists every built-in
 * skills fragment with the user's override and drift state).
 * @returns {string} The skill-overrides endpoint URL
 */
export function getSkillOverridesUrl(): string {
  return getMcpUrl().replace(/\/mcp$/, "/skill-overrides");
}

/**
 * Gets the endpoint URL for a single skills-fragment override slot (PUT to
 * save an override, DELETE to reset it to the built-in).
 * @param slot - The slot name
 * @returns {string} The per-slot skill-overrides endpoint URL
 */
export function getSkillOverrideUrl(slot: string): string {
  return `${getSkillOverridesUrl()}/${encodeURIComponent(slot)}`;
}

/**
 * Gets the update-check endpoint URL (the version check the server makes once at
 * startup and then serves from memory).
 * @returns {string} The update-check endpoint URL
 */
export function getUpdateUrl(): string {
  return getMcpUrl().replace(/\/mcp$/, "/update");
}

/**
 * Gets the global-settings endpoint URL (the machine-global
 * ~/.producer-pal/settings.json preferences, distinct from the device's live
 * /config state).
 * @returns {string} The settings endpoint URL
 */
export function getSettingsUrl(): string {
  return getMcpUrl().replace(/\/mcp$/, "/settings");
}

/**
 * Gets the memory collection endpoint URL (lists every stored memory entry;
 * the LLM-managed ~/.producer-pal/memory/ collection).
 * @returns {string} The memory collection endpoint URL
 */
export function getMemoryCollectionUrl(): string {
  return getMcpUrl().replace(/\/mcp$/, "/memory");
}

/**
 * Gets the endpoint URL for a single memory entry (PUT to create/overwrite,
 * DELETE to remove). The name is slugified server-side.
 * @param name - The memory name
 * @returns {string} The per-entry memory endpoint URL
 */
export function getMemoryEntryUrl(name: string): string {
  return `${getMemoryCollectionUrl()}/${encodeURIComponent(name)}`;
}

/**
 * Gets the custom-skills collection endpoint URL (lists every user-authored
 * skill; the ~/.producer-pal/skills-custom/ collection).
 * @returns {string} The custom-skills collection endpoint URL
 */
export function getCustomSkillsCollectionUrl(): string {
  return getMcpUrl().replace(/\/mcp$/, "/custom-skills");
}

/**
 * Gets the endpoint URL for a single custom skill (PUT to create/overwrite,
 * DELETE to remove). The name is slugified server-side.
 * @param name - The custom skill name
 * @returns {string} The per-entry custom-skills endpoint URL
 */
export function getCustomSkillEntryUrl(name: string): string {
  return `${getCustomSkillsCollectionUrl()}/${encodeURIComponent(name)}`;
}

/**
 * Gets the skills-preview endpoint URL for a notation + small-model combination
 * (the assembled "# Producer Pal Skills" blob ppal-connect would return for that
 * combination, with the user's fragment overrides applied).
 * @param notation - The notation to preview
 * @param smallModel - Whether to preview the small-model (basic) skills
 * @returns {string} The skills-preview endpoint URL with query params
 */
export function getSkillsPreviewUrl(
  notation: string,
  smallModel: boolean,
): string {
  const base = getMcpUrl().replace(/\/mcp$/, "/skills-preview");
  const params = new URLSearchParams({
    notation,
    smallModel: String(smallModel),
  });

  return `${base}?${params.toString()}`;
}

/**
 * Gets the subagent-briefing endpoint URL (the system-prompt addendum a spawned
 * worker starts with: skills, the Live Set, and the user's context layers). The
 * caller's profile rides on request headers, not query params, so there is
 * nothing to interpolate here.
 *
 * The briefing lives beside the MCP endpoint on the same server, so it follows
 * the same base: pass a client config's `mcpUrl` override and the briefing is
 * fetched from that server, exactly as its MCP requests would be.
 * @param {string} [mcpUrl] - A client config's MCP URL override, if it set one
 * @returns {string} The subagent-briefing endpoint URL
 */
export function getSubagentBriefingUrl(mcpUrl?: string): string {
  return (mcpUrl ?? getMcpUrl()).replace(/\/mcp$/, "/subagent-briefing");
}

/**
 * Gets the MCP server URL based on the current page origin.
 * In dev mode (Vite on port 5173), falls back to localhost:3350.
 * @returns {string} The MCP server URL
 */
export function getMcpUrl(): string {
  // Test environment or SSR: use default
  if (typeof window === "undefined") {
    return DEFAULT_MCP_URL;
  }

  const { hostname, port, protocol } = window.location;

  // Vite dev server (port 5173 is outside Producer Pal's 3300-3555 range)
  if (port === VITE_DEV_PORT) {
    return DEFAULT_MCP_URL;
  }

  // Production: use same origin as the page (UI served from MCP server)
  const portPart = port ? `:${port}` : "";

  return `${protocol}//${hostname}${portPart}/mcp`;
}
