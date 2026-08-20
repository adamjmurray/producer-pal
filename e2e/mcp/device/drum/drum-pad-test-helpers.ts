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
  sleep,
} from "../../mcp-test-helpers";

export interface ChainInfo {
  name?: string;
  gainDb?: number;
  pan?: number;
  chokeGroup?: number;
  mappedPitch?: string;
  state?: string;
  devices?: { type?: string }[];
}

export interface DrumPadInfo {
  id: string;
  pitch: string;
  state?: string;
  chains?: ChainInfo[];
}

export interface TrackDrumRack {
  /** The new track's index */
  trackIndex: number;
  /** Producer Pal path to the Drum Rack, e.g. `t3/d1` */
  rackPath: string;
  /** The rack's index on the track, for building a raw LiveAPI path */
  deviceIndex: number;
}

/**
 * Create a MIDI track holding a Drum Rack with two populated pads (C1, D1).
 *
 * Address the rack through `rackPath` — the track's default preset decides
 * what index it lands at, and that preset differs per machine.
 * @param client - Connected MCP client
 * @returns The new track's index and where the rack landed
 */
export async function createTrackWithDrumRack(
  client: Client,
): Promise<TrackDrumRack> {
  const trackIndex = await createMidiTrack(client);
  const rack = await createTwoPadDrumRack(client, `t${trackIndex}`);

  return { trackIndex, rackPath: rack.path, deviceIndex: rack.deviceIndex };
}

/**
 * Build a rack whose D1 pad holds two layers, by copying C1's pad onto it.
 * @param client - Connected MCP client
 * @returns The rack's path and D1's pad id
 */
export async function createLayeredPad(
  client: Client,
): Promise<{ rackPath: string; padId: string }> {
  const { rackPath } = await createTrackWithDrumRack(client);
  const sourceId = (await readDrumPad(client, `${rackPath}/pC1`)).id;

  await client.callTool({
    name: "ppal-duplicate",
    arguments: { type: "drum-pad", id: sourceId, toPath: `${rackPath}/pD1` },
  });

  await sleep(200);

  const pad = await readDrumPad(client, `${rackPath}/pD1`);

  if (pad.chains?.length !== 2) {
    throw new Error(`expected 2 layers on D1, got ${pad.chains?.length ?? 0}`);
  }

  return { rackPath, padId: pad.id };
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
