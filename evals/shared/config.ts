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

  await assertTestSwitchesApplied(options, response);
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

// --- Helpers below main exports ---

/**
 * A device built before it accepted `remoteScriptEnabled` and
 * `remoteScriptMinVersion` answers 200 and drops them, so a run meant to hide
 * or age the remote script would quietly use the real one. Their absence from
 * the echoed config is how to tell. Turning the remote script back on (the
 * reset) is harmless either way, so only a switch that changes the script is
 * checked.
 * @param options - What was sent
 * @param response - The server's answer, which echoes the config it holds
 */
async function assertTestSwitchesApplied(
  options: ConfigOptions,
  response: Response,
): Promise<void> {
  const wanted: Array<[string, unknown]> = [];

  if (options.remoteScriptEnabled === false) {
    wanted.push(["remoteScriptEnabled", false]);
  }

  if (typeof options.remoteScriptMinVersion === "string") {
    wanted.push(["remoteScriptMinVersion", options.remoteScriptMinVersion]);
  }

  if (wanted.length === 0) {
    return;
  }

  const applied = (await response.json()) as Record<string, unknown>;

  for (const [name, value] of wanted) {
    if (applied[name] !== value) {
      throw new Error(
        `The server ignored ${name}: the device build is too old to accept it. Rebuild the device.`,
      );
    }
  }
}
