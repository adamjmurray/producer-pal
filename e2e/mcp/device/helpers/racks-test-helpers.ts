// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  parseToolResult,
  parseToolResultWithWarnings,
  sleep,
  type ToolResultWithWarnings,
} from "../../mcp-test-helpers.ts";

export const RACKS_TEST_PATH =
  "e2e/live-sets/racks-test Project/racks-test.als";

/** The Drum Rack carrying the macro mappings, nested in an Instrument Rack. */
export const KIT = "t0/d0/c0/d0";

export interface ChainInfo {
  id: string;
  path?: string;
  name?: string;
  gainDb?: number;
  pan?: number;
  sends?: { return: string; returnId?: string; gainDb: number }[];
  devices?: DeviceInfo[];
  deviceCount?: number;
}

export interface DeviceInfo {
  id: string;
  path?: string;
  type: string;
  name?: string;
  drumPads?: DrumPadInfo[];
  chains?: ChainInfo[];
  returnChains?: ChainInfo[];
  drumMap?: Record<string, string>;
  drumRackPath?: string;
  parameters?: { name: string; value?: unknown; enabled?: boolean }[];
}

export interface DrumPadInfo {
  id?: string;
  path?: string;
  note: number;
  pitch: string;
  name: string;
  chainCount?: number;
  hasInstrument?: boolean;
  chains?: ChainInfo[];
}

/**
 * Call a tool and return both its parsed payload and any WARNING blocks.
 * @param client - MCP client
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns The parsed result and its warnings
 */
export async function callWithWarnings(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResultWithWarnings<Record<string, unknown>>> {
  const result = await client.callTool({ name, arguments: args });

  await sleep(50);

  return parseToolResultWithWarnings<Record<string, unknown>>(result);
}

/**
 * Read the Kit's drum pads with their chains, so chain mixer values are visible.
 * @param client - MCP client
 * @returns The Kit drum rack
 */
export async function readKitPads(client: Client): Promise<DeviceInfo> {
  const result = await client.callTool({
    name: "ppal-read-device",
    arguments: { path: KIT, include: ["drum-pads", "chains"], maxDepth: 1 },
  });

  return parseToolResult<DeviceInfo>(result);
}

/**
 * Find a pad's first chain by pad name, so a test can assert its mixer values.
 * @param kit - The Kit drum rack, read with drum-pads + chains
 * @param padName - The pad's name (e.g. "Kick")
 * @returns The pad's first chain
 */
export function padChain(kit: DeviceInfo, padName: string): ChainInfo {
  const pad = kit.drumPads?.find((p) => p.name === padName);

  if (pad?.chains?.[0] == null) {
    throw new Error(`no chain found for pad "${padName}"`);
  }

  return pad.chains[0];
}

/**
 * Read the Kit's return chains.
 * @param client - MCP client
 * @returns The Kit's return chains
 */
export async function readReturnChains(client: Client): Promise<ChainInfo[]> {
  const result = await client.callTool({
    name: "ppal-read-device",
    arguments: { path: KIT, include: ["return-chains"] },
  });

  return parseToolResult<DeviceInfo>(result).returnChains ?? [];
}

/**
 * Assert a warning names a parameter as disabled.
 * @param warnings - Warnings from the tool result
 * @param label - How the warning names the parameter, e.g. `chain "Kick" pan`
 * @returns True when a matching warning is present
 */
export function warnsDisabled(warnings: string[], label: string): boolean {
  return warnings.some(
    (w) => w.includes(label) && w.includes("is disabled and was not changed"),
  );
}
