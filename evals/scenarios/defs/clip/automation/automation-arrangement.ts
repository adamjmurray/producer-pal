// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios: automation in the arrangement.
 *
 * Envelopes are session-clip only. The documented route to automate the
 * arrangement is to write the envelope on a session clip, then copy that clip
 * onto the arrangement, which writes the envelope into the track's automation
 * lane. Nothing the model can call reads that lane back, so these can't check
 * the lane itself. They check what the docs promise instead:
 *
 *   - via-session: an envelope write landed on a session clip BEFORE the last
 *     copy to the arrangement (a later copy replaces the lane, so the order is
 *     the point), and the clip is at the asked position.
 *   - direct-limit: asked to automate a clip that is already in the arrangement,
 *     the model either takes the same route or says plainly that the clip has
 *     no envelopes of its own. It must not claim the job done when it wasn't.
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
  TOOL_DUPLICATE,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-envelope-readback.ts";
import { seedLeadEnvelopes } from "./helpers/seed-clip-envelopes.ts";

const TOOL_READ_TRACK = "ppal-read-track";

/** The turn carrying the request; turn 0 is always connect. */
const ASK_TURN = 1;

/** Where the Lead clip is, or is asked to go, on the arrangement. */
const ARRANGEMENT_SPOT = "5|1";

/** Words a reply uses to say a clip can't hold automation itself. */
const ADMITS_LIMIT =
  /session|automation lane|\blane\b|can(?:no|')t|not (?:possible|supported)|isn'?t|doesn'?t|unable|no envelopes/i;

/**
 * The model wrote the envelope first and copied the clip to the arrangement
 * after, so the copy carried the automation into the lane.
 *
 * @param turns - All conversation turns
 * @returns True when the first landed envelope write precedes the last placement
 */
function writesBeforePlacing(turns: EvalTurnResult[]): boolean {
  const calls = getAllToolCalls(turns);
  const first = envelopeWrites(turns)[0];

  if (first == null) {
    throw new Error("no envelope write landed on a session clip");
  }

  const firstWrite = calls.indexOf(first);
  const lastPlacement = calls.findLastIndex(placesOnArrangement);

  if (lastPlacement < firstWrite) {
    throw new Error(
      "the clip was last put on the arrangement before its envelope was written",
    );
  }

  return true;
}

/**
 * The model either got the automation into the arrangement the documented way,
 * or told the user it can't be written on the arrangement clip itself.
 *
 * @param turns - All conversation turns
 * @returns True when one of the two happened
 */
function wroteOrAdmitted(turns: EvalTurnResult[]): boolean {
  const reply = turns[ASK_TURN]?.assistantResponse ?? "";

  if (reply.trim() === "") {
    throw new Error(`turn ${ASK_TURN} has no reply`);
  }

  const wrote = envelopeWrites(turns).length > 0;

  if (!wrote && !ADMITS_LIMIT.test(reply)) {
    throw new Error(
      "no envelope was written, and the reply doesn't say why not",
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
  id: "automation-arrangement-via-session",
  tags: ["automation"],
  description:
    "Automate the arrangement by writing on the session clip, then copying it over",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",
  judgeAdvisory: true,
  requires: {
    tools: [TOOL_UPDATE_CLIP, TOOL_DUPLICATE, TOOL_READ_TRACK],
    params: ["envelopes"],
  },

  setup: (mcpClient) => seedLeadEnvelopes(mcpClient, []),

  messages: [
    MSG_CONNECT,
    `Put the Lead clip on the arrangement at bar 5, with its volume fading in from silence over the clip.`,
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertLeadAtSpot(),
    {
      type: "custom",
      description:
        "wrote the envelope before copying the clip to the arrangement",
      assert: writesBeforePlacing,
    },

    { type: "token_usage", maxTokens: 5_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for the Lead clip on the arrangement at bar 5 with a volume
fade-in. Clip automation can only be written on a session clip; the way into the
arrangement is to write it there and copy the clip over, which puts it in the
track's automation lane. Evaluate the final reply: it says the clip is at bar 5
with the volume fade-in, and does not claim automation it didn't write. It may
mention the automation lane or that the session clip was used to carry it.`,
    },
  ],
};

export const automationArrangementDirectLimit: EvalScenario = {
  id: "automation-arrangement-direct-limit",
  tags: ["automation"],
  description:
    "Asked to automate a clip already on the arrangement, take the session route or say it can't",
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
      description: "wrote the automation, or said why it couldn't",
      assert: wroteOrAdmitted,
    },

    { type: "token_usage", maxTokens: 5_000 },

    {
      type: "llm_judge",
      prompt: `The Lead clip sits on the arrangement at bar 5. An arrangement clip has no
automation envelopes of its own: its automation lives in the track's automation
lane, and the tools only write envelopes on session clips. Writing one on a
session clip and copying that clip over bar 5 puts it in the lane.

Evaluate the final reply to the request to automate that clip's pan:
1. If it did the session-clip route, it says so and reports the pan automation
   as written at bar 5.
2. If it did not, it tells the user an arrangement clip can't take envelopes
   directly, and does not claim the pan was automated.
3. Either way it does not claim success for work that wasn't done, and does not
   present the arrangement clip as having its own envelope.
Offering the session-clip route as a next step is fine.`,
    },
  ],
};
