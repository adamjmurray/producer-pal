// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared setup for the drum-pad suites: both build the same two-pad rack on a
// fresh track, then read pads back to check what moved or copied.

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  createMidiTrack,
  createTwoPadDrumRack,
  parseToolResult,
} from "../../mcp-test-helpers";

export interface ChainInfo {
  name?: string;
  gainDb?: number;
  pan?: number;
  chokeGroup?: number;
  devices?: { type?: string }[];
}

export interface DrumPadInfo {
  id: string;
  pitch: string;
  chains?: ChainInfo[];
}

/**
 * Create a MIDI track holding a Drum Rack with two populated pads (C1, D1).
 * @param client - Connected MCP client
 * @returns The new track's index
 */
export async function createTrackWithDrumRack(client: Client): Promise<number> {
  const trackIndex = await createMidiTrack(client);

  await createTwoPadDrumRack(client, `t${trackIndex}`);

  return trackIndex;
}

/**
 * Read one drum pad with its chains.
 * @param client - Connected MCP client
 * @param path - Producer Pal path to the pad
 * @returns The pad's info
 */
export async function readDrumPad(
  client: Client,
  path: string,
): Promise<DrumPadInfo> {
  return parseToolResult<DrumPadInfo>(
    await client.callTool({
      name: "ppal-read-device",
      arguments: { path, include: ["chains"] },
    }),
  );
}
