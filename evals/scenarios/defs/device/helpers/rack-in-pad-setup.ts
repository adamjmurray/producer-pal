// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The layered kit the rack-in-pad scenarios run on: the Drums track's kit with
 * an Instrument Rack inside the kick pad and inside the snare pad, two layers
 * each. Users layer sounds this way, and a layer is four path segments below
 * the pad (`pad / pad chain / rack / rack chain / device`).
 *
 * The shipped Sets have no rack in a pad and must stay as they are, so `setup`
 * builds it through the tools. Each pad is cleared first, so a re-run against
 * an already-seeded Set rebuilds it from scratch. The kit's other snare pad
 * (D#1) is cleared too, so "the snare" names one pad.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText, parseToolResult } from "#evals/chat/mcp.ts";
import { sleep } from "#evals/shared/sleep.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";
import { withConfig } from "../../helpers/with-config.ts";
import {
  type LayerSpec,
  layersAreUntouched,
  rackChains,
} from "./rack-in-pad-readback.ts";

/** The Cyndal Kit sits inside an Instrument Rack, two levels below the track. */
const KIT = "t0/d0/c0/d0";

export const KICK_PAD = `${KIT}/pC1`;
export const SNARE_PAD = `${KIT}/pE1`;
/** The shipped kit's second snare, cleared so there is one. */
const SPARE_SNARE_PAD = `${KIT}/pD#1`;

/** The Instrument Rack inside a pad: the pad's chain 0, device 0. */
export const KICK_RACK = `${KICK_PAD}/c0/d0`;
export const SNARE_RACK = `${SNARE_PAD}/c0/d0`;

/** Different levels, so "the other layer" is told apart by reading it. */
export const KICK_TOP: LayerSpec = {
  name: "Top",
  device: "Operator",
  gainDb: -2,
};
export const KICK_SUB: LayerSpec = { name: "Sub", device: "Drift", gainDb: -4 };
export const KICK_LAYERS: LayerSpec[] = [KICK_TOP, KICK_SUB];
export const SNARE_LAYERS: LayerSpec[] = [
  { name: "Body", device: "Drift", gainDb: -3 },
  { name: "Snap", device: "Operator", gainDb: -5 },
];

/**
 * Call a tool and fail loudly, so a setup that didn't land can't pass for a
 * model failure.
 *
 * @param mcpClient - MCP client for tool calls
 * @param name - Tool name
 * @param args - Tool arguments
 * @returns The parsed result
 */
async function callOrThrow(
  mcpClient: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await mcpClient.callTool({ name, arguments: args });
  const text = extractToolResultText(result);

  if (result.isError === true) {
    throw new Error(
      `rack-in-pad setup: ${name} ${JSON.stringify(args)} failed: ${text}`,
    );
  }

  return parseToolResult(text);
}

/**
 * Read a rack with its chains and their devices.
 *
 * @param mcpClient - MCP client for tool calls
 * @param path - Rack path
 * @returns The parsed read
 */
function readRack(mcpClient: Client, path: string): Promise<unknown> {
  return callOrThrow(mcpClient, TOOLS.readDevice, {
    path,
    include: ["chains"],
    maxDepth: 1,
  });
}

/**
 * Build one layered pad: an empty pad, an Instrument Rack on it, a named layer
 * per spec, and the pad named for what it plays.
 *
 * @param mcpClient - MCP client for tool calls
 * @param pad - Path of the (cleared) pad
 * @param padName - What the pad is called in the kit
 * @param layers - The rack's layers, first to last
 */
async function buildLayeredPad(
  mcpClient: Client,
  pad: string,
  padName: string,
  layers: LayerSpec[],
): Promise<void> {
  const rack = `${pad}/c0/d0`;

  await callOrThrow(mcpClient, TOOLS.createDevice, {
    deviceName: "Instrument Rack",
    path: `${pad}/d0`,
  });
  await sleep(150);

  const fresh = rackChains(await readRack(mcpClient, rack));

  if (fresh.length > 0) {
    throw new Error(
      `rack-in-pad setup: the new Instrument Rack on ${pad} arrived with ${fresh.length} chains; expected none`,
    );
  }

  // One call, one `c+` per layer: each appends its own chain.
  await callOrThrow(mcpClient, TOOLS.createDevice, {
    deviceName: layers.map((layer) => layer.device).join(","),
    path: layers.map(() => `${rack}/c+`).join(","),
  });
  await sleep(150);

  for (const [index, layer] of layers.entries()) {
    await callOrThrow(mcpClient, TOOLS.updateDevice, {
      path: `${rack}/c${index}`,
      name: layer.name,
      gainDb: layer.gainDb,
    });
  }

  // The pad has one chain, so a pad-path name lands on it.
  await callOrThrow(mcpClient, TOOLS.updateDevice, {
    path: pad,
    name: padName,
  });
  await sleep(150);

  const built = await readRack(mcpClient, rack);

  if (!layersAreUntouched(built, layers)) {
    throw new Error(
      `rack-in-pad setup: ${rack} does not hold ${layers
        .map((layer) => `${layer.name} (${layer.device}, ${layer.gainDb} dB)`)
        .join(", ")}: ${JSON.stringify(built)}`,
    );
  }
}

/**
 * Seed the layered kick and snare. Both pads' own faders stay at 0 dB, so a
 * model that turns the pad down instead of a layer is told apart. Small-model
 * mode is off meanwhile: it hides `gainDb`, which the layers need.
 *
 * @param mcpClient - MCP client for tool calls
 * @returns Resolves once both pads are built
 */
export function seedRacksInPads(mcpClient: Client): Promise<void> {
  return withConfig({ smallModelMode: false }, () => buildKit(mcpClient));
}

/**
 * Clear the pads and build both layered pads.
 *
 * @param mcpClient - MCP client for tool calls
 */
async function buildKit(mcpClient: Client): Promise<void> {
  await callOrThrow(mcpClient, TOOLS.delete, {
    type: "drum-pad",
    path: [KICK_PAD, SPARE_SNARE_PAD, SNARE_PAD].join(","),
  });
  await sleep(150);

  await buildLayeredPad(mcpClient, KICK_PAD, "Kick", KICK_LAYERS);
  await buildLayeredPad(mcpClient, SNARE_PAD, "Snare", SNARE_LAYERS);
}
