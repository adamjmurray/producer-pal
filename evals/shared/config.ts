// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Configuration utilities for MCP server settings
 */

import { MCP_URL } from "#evals/shared/mcp-url.ts";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation.ts";

export const CONFIG_URL = MCP_URL.replace("/mcp", "/config");

/**
 * Configuration options that can be set via the /config endpoint
 */
export interface ConfigOptions {
  projectContext?: string;
  smallModelMode?: boolean;
  jsonOutput?: boolean;
  sampleFolder?: string;
  liveApiEnabled?: boolean;
  /** False makes the remote script look uninstalled. Debug builds only; a release build ignores it. */
  remoteScriptEnabled?: boolean;
  tools?: string[];
  notation?: Notation;
}

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

/**
 * Read the server's current config via the /config endpoint.
 *
 * @returns The fields scenarios restore after changing them
 */
async function fetchConfig(): Promise<{
  notation?: Notation;
  liveApiEnabled?: boolean;
}> {
  const response = await fetch(CONFIG_URL);

  if (!response.ok) {
    throw new Error(`Failed to get config: ${response.status}`);
  }

  return (await response.json()) as {
    notation?: Notation;
    liveApiEnabled?: boolean;
  };
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
    tools: [...TOOL_NAMES],
    notation: DEFAULT_NOTATION,
  });
}
