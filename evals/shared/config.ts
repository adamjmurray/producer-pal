// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

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
 * Read the server's current notation via the /config endpoint.
 *
 * Used to snapshot the active notation before an assertion temporarily flips it,
 * so the prior value (e.g. a scenario's configured notation) can be restored
 * rather than hardcoding the default.
 *
 * @returns The current notation, falling back to the default if unset
 */
export async function getNotation(): Promise<Notation> {
  const response = await fetch(CONFIG_URL);

  if (!response.ok) {
    throw new Error(`Failed to get config: ${response.status}`);
  }

  const config = (await response.json()) as { notation?: Notation };

  return config.notation ?? DEFAULT_NOTATION;
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
    tools: [...TOOL_NAMES],
    notation: DEFAULT_NOTATION,
  });
}
