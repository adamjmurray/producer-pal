// Producer Pal
// Copyright (C) 2026 Adam Murray
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
 * context, distinct from the per-project /config memory).
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
