// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: swap a drum kit onto an existing Drum Rack by its name.
 *
 * A pack's drum kit isn't filed under any device in Live's browser, so only a
 * lookup in Live's library finds it by name. `device-kit-by-name` covers that
 * for a new device; this covers `ppal-update-device` with `preset` on a rack
 * already on a track.
 *
 * `setup` makes a new MIDI track holding an empty Drum Rack. Graded on the
 * Set: the track ends with one Drum Rack, named for the kit. A model that adds
 * a second rack beside the empty one fails on the count.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText, parseToolResult } from "#evals/chat/mcp.ts";
import { type EvalScenario } from "../../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../../clip/helpers/clip-tool-constants.ts";
import { firstResultPath } from "../../helpers/new-track-path.ts";

const KIT = /505/;

/** basic-midi-4-track has five tracks (t0-t4), so a new one lands at t5. */
const NEW_TRACK = "t5";

/** A track read with its devices. */
interface TrackDevices {
  devices?: Array<{ type?: string; name?: string }>;
}

/**
 * Add a MIDI track with an empty Drum Rack. Throws unless the track lands at
 * t5, where the grading reads it, with one Drum Rack on it.
 *
 * @param mcpClient - MCP client for tool calls
 */
async function seedEmptyDrumRack(mcpClient: Client): Promise<void> {
  const created = await mcpClient.callTool({
    name: "ppal-create-track",
    arguments: { type: "midi" },
  });
  const path = firstResultPath(extractToolResultText(created));

  if (path !== NEW_TRACK) {
    throw new Error(`expected the new track at ${NEW_TRACK}, got ${path}`);
  }

  await mcpClient.callTool({
    name: "ppal-create-device",
    arguments: { device: "Drum Rack", path: `${NEW_TRACK}/d+` },
  });

  const read = parseToolResult(
    extractToolResultText(
      await mcpClient.callTool({
        name: "ppal-read-track",
        arguments: { path: NEW_TRACK, include: ["devices"] },
      }),
    ),
  );

  if (drumRackNames(read).length !== 1) {
    throw new Error(`expected one Drum Rack on ${NEW_TRACK} after seeding`);
  }
}

/**
 * The Drum Racks on a track read.
 *
 * @param result - Parsed ppal-read-track result
 * @returns Each Drum Rack's name, "" when unnamed
 */
function drumRackNames(result: unknown): string[] {
  return ((result as TrackDevices).devices ?? [])
    .filter((device) => (device.type ?? "").includes("drum-rack"))
    .map((device) => device.name ?? "");
}

export const devicePresetSwapByName: EvalScenario = {
  id: "device-preset-swap-by-name",
  tags: ["devices"],
  description: "Swap a named library drum kit onto an existing Drum Rack",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  requires: { tools: ["ppal-update-device"] },

  setup: seedEmptyDrumRack,

  messages: [
    MSG_CONNECT,
    "The new MIDI track has an empty Drum Rack. Put the 505 Classic Kit in it, in place of the empty one.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    {
      type: "state",
      tool: "ppal-read-track",
      args: { path: NEW_TRACK, include: ["devices"] },
      expect: (result) => {
        const racks = drumRackNames(result);

        return racks.length === 1 && KIT.test(racks[0] ?? "");
      },
      explain: (result) =>
        `expected one Drum Rack named for the 505 kit, Drum Racks are: ${drumRackNames(result).join(", ") || "none"}`,
    },

    { type: "token_usage", maxTokens: 2_500 },
  ],
};
