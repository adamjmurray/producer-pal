// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Seeding automation into the Lead clip from a scenario `setup`, so a scenario
 * can start from known envelopes without leaning on the write path it grades.
 * Goes straight to the Producer Pal remote script's own HTTP routes, which is
 * also why every automation scenario needs that script running on the machine
 * that runs Live.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText, parseToolResult } from "#evals/chat/mcp.ts";
import { resolveRemoteScriptPort } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import {
  type ClipEnvelopeRead,
  envelopesOf,
  LEAD_CLIP,
  TOOL_READ_CLIP,
} from "./clip-envelope-readback.ts";

/** One envelope to seed: a mixer parameter and its points. */
export interface SeedEnvelope {
  /** volume, pan or send0 */
  parameter: string;
  /** Beats from the clip start, and raw values. `jump` holds then jumps. */
  points: Array<{ time: number; value: number; jump?: boolean }>;
}

/** The Lead clip's two bars, seeded the same way for every scenario that reads. */
export const LEAD_SEEDS: SeedEnvelope[] = [
  {
    parameter: "volume",
    points: [
      { time: 0, value: 0.4 },
      { time: 4, value: 0.85 },
    ],
  },
  {
    parameter: "pan",
    points: [
      { time: 0, value: -0.5 },
      { time: 4, value: 0.5, jump: true },
    ],
  },
  {
    parameter: "send0",
    points: [
      { time: 0, value: 0.1 },
      { time: 6, value: 0.7 },
    ],
  },
];

const TRACK = "t3";
const SLOT = 0;
const SETTLE_MS = 100;

/**
 * Replace the Lead clip's automation with exactly these envelopes (none clears
 * it). Throws if the clip doesn't read back with them, so a seed that never
 * took can't pass a scenario for the wrong reason.
 *
 * @param mcpClient - MCP client for the read-back
 * @param seeds - The envelopes the clip should end up with
 */
export async function seedLeadEnvelopes(
  mcpClient: Client,
  seeds: SeedEnvelope[],
): Promise<void> {
  await post("/envelope/clear", {});

  for (const seed of seeds) {
    await post("/envelope/write", seed);
  }

  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

  const seeded = await readLeadEnvelopes(mcpClient);

  if (seeded.length !== seeds.length) {
    throw new Error(
      `${LEAD_CLIP} reports ${seeded.length} envelopes after seeding ${seeds.length}`,
    );
  }
}

/**
 * Read the Lead clip's envelopes through the tool the model uses.
 *
 * @param mcpClient - MCP client for tool calls
 * @returns The envelope entries
 */
async function readLeadEnvelopes(
  mcpClient: Client,
): Promise<ClipEnvelopeRead[]> {
  const result = await mcpClient.callTool({
    name: TOOL_READ_CLIP,
    arguments: { path: LEAD_CLIP, include: ["envelopes"] },
  });

  if (result.isError === true) {
    throw new Error(
      `could not read ${LEAD_CLIP}: ${extractToolResultText(result)}`,
    );
  }

  return envelopesOf(parseToolResult(extractToolResultText(result)));
}

/**
 * POST to one of the remote script's envelope routes for the Lead clip.
 *
 * @param route - e.g. "/envelope/write"
 * @param body - Route args beyond the clip's address
 */
async function post(route: string, body: object): Promise<void> {
  const port = await resolveRemoteScriptPort();
  let response: Response;

  try {
    response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: "POST",
      body: JSON.stringify({ track: TRACK, slot: SLOT, ...body }),
    });
  } catch {
    throw new Error(
      `automation scenarios need the Producer Pal remote script, but nothing answered on 127.0.0.1:${port}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `${route} answered ${response.status}: ${await response.text()}`,
    );
  }
}
