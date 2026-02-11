// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Configuration utilities for MCP server settings
 */

const MCP_URL = process.env.MCP_URL ?? "http://localhost:3350/mcp";

export const CONFIG_URL = MCP_URL.replace("/mcp", "/config");

/**
 * Configuration options that can be set via the /config endpoint
 */
export interface ConfigOptions {
  memoryEnabled?: boolean;
  memoryContent?: string;
  memoryWritable?: boolean;
  smallModelMode?: boolean;
  jsonOutput?: boolean;
  sampleFolder?: string;
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
 * Reset server config to defaults
 */
export async function resetConfig(): Promise<void> {
  await setConfig({
    smallModelMode: false,
    memoryEnabled: false,
    memoryContent: "",
    memoryWritable: false,
    jsonOutput: true,
    sampleFolder: "",
  });
}
