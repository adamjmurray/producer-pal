// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Configuration utilities for MCP server settings
 */

import { MCP_URL } from "#evals/shared/mcp-url.ts";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import {
  type ProducerPalConfig,
  type ProducerPalConfigUpdate,
} from "#src/shared/config.ts";
import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation.ts";

export const CONFIG_URL = siblingUrl(MCP_URL, "config");
export const REST_BASE_URL = siblingUrl(MCP_URL, "").replace(/\/$/, "");

/** Configuration options that can be set via the /config endpoint */
export type ConfigOptions = ProducerPalConfigUpdate & { notation?: Notation };

/**
 * Update server config via the /config endpoint
 *
 * @param options - Config options to set
 */
export async function setConfig(options: ConfigOptions): Promise<void> {
  const response = await fetch(CONFIG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new Error(`Failed to set config: ${response.status}`);
  }
}

type RestorableConfig = Partial<
  Pick<ProducerPalConfig, "liveApiEnabled" | "smallModelMode">
> & { notation?: Notation };

/**
 * Read the server's current config via the /config endpoint.
 *
 * @returns The fields scenarios restore after changing them
 */
async function fetchConfig(): Promise<RestorableConfig> {
  const response = await fetch(CONFIG_URL);

  if (!response.ok) {
    throw new Error(`Failed to get config: ${response.status}`);
  }

  return (await response.json()) as RestorableConfig;
}

/**
 * Read the server's current notation via the /config endpoint.
 *
 * Used to snapshot the active notation before an assertion temporarily flips it,
 * so the prior value (e.g. a scenario's configured notation) can be restored
 * rather than hardcoding the default.
 *
 * @returns The current notation, falling back to the default if unset
 */
export async function getNotation(): Promise<Notation> {
  const config = await fetchConfig();

  return config.notation ?? DEFAULT_NOTATION;
}

/**
 * Whether the server currently exposes the Direct Live API tool.
 *
 * @returns True when `ppal-live-api` is enabled
 */
export async function getLiveApiEnabled(): Promise<boolean> {
  const config = await fetchConfig();

  return config.liveApiEnabled === true;
}

/**
 * Whether the server is in small-model mode.
 *
 * @returns True when small-model mode is on
 */
export async function getSmallModelMode(): Promise<boolean> {
  const config = await fetchConfig();

  return config.smallModelMode === true;
}

/**
 * Reset server config to defaults
 */
export async function resetConfig(): Promise<void> {
  await setConfig({
    smallModelMode: false,
    projectContext: "",
    jsonOutput: true,
    sampleFolder: "",
    // A release build ignores this, so the reset works on either build.
    remoteScriptEnabled: true,
    remoteScriptMinVersion: null,
    tools: [...TOOL_NAMES],
    notation: DEFAULT_NOTATION,
  });
}

/**
 * The URL of a sibling endpoint of the MCP server. Only the trailing `/mcp`
 * path segment changes, never a `mcp` in the host or an earlier path part.
 *
 * @param mcpUrl - The MCP endpoint URL
 * @param endpoint - Endpoint name without a slash (e.g., "config")
 * @returns The sibling endpoint URL
 */
export function siblingUrl(mcpUrl: string, endpoint: string): string {
  const url = new URL(mcpUrl);

  url.pathname = url.pathname.replace(/\/mcp$/, `/${endpoint}`);

  return url.toString();
}
