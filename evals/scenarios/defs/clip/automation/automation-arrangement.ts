// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenarios: automation in the arrangement.
 *
 * Two routes reach a track's arrangement automation lane: write `envelopes` on
 * the arrangement clip (it writes the lane over the clip's span), or write them
 * on a session clip and copy that clip over the span. Either counts. The lane
 * itself isn't checked: a track read only reports it while the track plays the
 * arrangement, and these Sets play from Session.
 *
 *   - via-session: the Lead session clip goes to bar 5 with a fade, so the
 *     envelope lands on the arrangement clip after the last copy, or on the
 *     session clip before it (a later copy replaces the lane).
 *   - direct: the Lead clip is already at bar 5, and the model automates it.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText } from "#evals/chat/mcp.ts";
import { getAllToolCalls } from "../../../assertions/index.ts";
import { asArrangementTrack, clipStarts } from "../../arrangement-readback.ts";
import { type EvalScenario, type EvalTurnResult } from "../../../types.ts";
import { MSG_CONNECT, TOOL_CONNECT } from "../helpers/clip-tool-constants.ts";
import {
  envelopeWrites,
  LEAD_CLIP,
  LEAD_TRACK_INDEX,
  placesOnArrangement,
  resultEntries,
  TOOL_DUPLICATE,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-envelope-readback.ts";
import {
  ON_BARE_LEAD_CLIP,
  seedLeadEnvelopes,
} from "./helpers/seed-clip-envelopes.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

const TOOL_READ_TRACK = TOOLS.readTrack;

/** Where the Lead clip is, or is asked to go, on the arrangement. */
const ARRANGEMENT_SPOT = "5|1";

/**
 * An envelope write reached the clip at the arrangement spot: written on the
 * arrangement clip after its last placement, or on a session clip before a
 * copy put it there.
 *
 * @param turns - All conversation turns
 * @returns True when one of the two routes landed
 */
function automationReachedSpot(turns: EvalTurnResult[]): boolean {
  const calls = getAllToolCalls(turns);
  const lastPlacement = calls.findLastIndex(placesOnArrangement);

  const reached = envelopeWrites(turns).some((write) => {
    const index = calls.indexOf(write);
    const paths = resultEntries(write).map((entry) => String(entry.path));

    return paths.some((path) =>
      path.includes("[")
        ? path.includes(`[${ARRANGEMENT_SPOT}]`) && index > lastPlacement
        : index < lastPlacement,
    );
  });

  if (!reached) {
    throw new Error(
      `no envelope reached the clip at ${ARRANGEMENT_SPOT}: not written on the arrangement clip after placing it, nor on a session clip before copying it there`,
    );
  }

  return true;
}

/**
 * Put the Lead clip on the arrangement at bar 5 with no automation, so the
 * direct-limit scenario starts with a clip there to ask about.
 *
 * @param mcpClient - MCP client for tool calls
 */
async function seedArrangementLead(mcpClient: Client): Promise<void> {
  await seedLeadEnvelopes(mcpClient, []);

  const result = await mcpClient.callTool({
    name: TOOL_DUPLICATE,
    arguments: {
      type: "clip",
      path: LEAD_CLIP,
      toPath: `t${LEAD_TRACK_INDEX}[${ARRANGEMENT_SPOT}]`,
    },
  });

  if (result.isError === true) {
    throw new Error(
      `could not put the Lead clip on the arrangement: ${extractToolResultText(result)}`,
    );
  }
}

/**
 * The Lead track has a clip starting at the arrangement spot.
 *
 * @returns A state assertion over the Lead track's arrangement
 */
function assertLeadAtSpot() {
  return {
    type: "state" as const,
    tool: TOOL_READ_TRACK,
    args: { trackIndex: LEAD_TRACK_INDEX, include: ["arrangement-clips"] },
    expect: (result: unknown) =>
      clipStarts(asArrangementTrack(result).arrangementClips).includes(
        ARRANGEMENT_SPOT,
      ),
    explain: (result: unknown) =>
      `expected a Lead clip at ${ARRANGEMENT_SPOT}, got ${
        clipStarts(asArrangementTrack(result).arrangementClips).join(", ") ||
        "none"
      }`,
  };
}

export const automationArrangementViaSession: EvalScenario = {
  ...ON_BARE_LEAD_CLIP,
  id: "automation-arrangement-via-session",
  description:
    "Copy a session clip to the arrangement with a fade, by either route",
  requires: {
    tools: [TOOL_UPDATE_CLIP, TOOL_DUPLICATE, TOOL_READ_TRACK],
    params: ["envelopes"],
  },

  messages: [
    MSG_CONNECT,
    `Put the Lead clip on the arrangement at bar 5, with its volume fading in from silence over the clip.`,
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertLeadAtSpot(),
    {
      type: "custom",
      description: "the fade reached the clip at bar 5",
      assert: automationReachedSpot,
    },

    { type: "token_usage", maxTokens: 5_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for the Lead clip on the arrangement at bar 5 with a volume
fade-in. Two routes work: write the fade on the session clip and copy it to bar
5, or copy the clip first and write the fade on the arrangement clip (that
writes the track's automation lane over the clip's span, and the clip gets a new
id).

Evaluate the final reply:
1. It says the Lead clip is on the arrangement at bar 5.
2. It says the volume fade-in was written.`,
    },
  ],
};

export const automationArrangementDirect: EvalScenario = {
  id: "automation-arrangement-direct",
  tags: ["automation"],
  description: "Automate a clip already on the arrangement",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",
  requires: {
    tools: [TOOL_UPDATE_CLIP, TOOL_DUPLICATE, TOOL_READ_TRACK],
    params: ["envelopes"],
  },

  setup: seedArrangementLead,

  messages: [
    MSG_CONNECT,
    "Automate the pan of the Lead clip at bar 5 on the arrangement, from hard left to hard right.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertLeadAtSpot(),
    {
      type: "custom",
      description: "the pan automation reached the clip at bar 5",
      assert: automationReachedSpot,
    },

    { type: "token_usage", maxTokens: 5_000 },

    {
      type: "llm_judge",
      prompt: `The Lead clip sits on the arrangement at bar 5. Writing envelopes on an
arrangement clip writes the track's automation lane over that clip's span (the
clip is re-created under a new id). Copying an automated session clip over bar
5 works too.

Evaluate the final reply to the request to automate that clip's pan:
1. It reports pan automation from hard left to hard right as written at bar 5.
2. It does not say this is impossible.`,
    },
  ],
};
