// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios: write automation onto the Lead clip, then read it back.
 *
 *   - device parameter: the model has to look up the parameter's id first.
 *   - mixer targets: volume, pan and a send, each a name rather than an id.
 *
 * `setup` clears the clip's automation so only what the model wrote is read
 * back. The read-back checks the direction and rough range of each envelope,
 * not exact values: a model may spell "full volume" 0.85 or 1.
 */

import { type EvalScenario } from "../../../types.ts";
import { MSG_CONNECT, TOOL_CONNECT } from "../helpers/clip-tool-constants.ts";
import {
  assertLeadEnvelopes,
  envelopeValues,
  envelopeWrites,
  risesOverTime,
  sortEnvelopes,
  TOOL_READ_CLIP,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-envelope-readback.ts";
import { seedLeadEnvelopes } from "./helpers/seed-clip-envelopes.ts";

/** A device on the Lead track; the parameter name picks out the Utility. */
const LEAD_DEVICE_PATH = /^t3\/d\d+$/;

export const automationWriteDeviceParam: EvalScenario = {
  id: "automation-write-device-param",
  tags: ["automation"],
  description:
    "Automate a device parameter on the Lead clip, finding it by name first",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",
  judgeAdvisory: true,
  requires: {
    tools: [TOOL_READ_CLIP, TOOL_UPDATE_CLIP],
    params: ["envelopes"],
  },

  setup: (mcpClient) => seedLeadEnvelopes(mcpClient, []),

  messages: [
    MSG_CONNECT,
    "Make the Utility's Width on the Lead track sweep from narrow to wide over the Lead clip.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    {
      type: "custom",
      description: "an envelopes write landed",
      assert: (turns) => envelopeWrites(turns).length > 0,
    },

    // Exactly one envelope: the Width of a device on the Lead track, rising.
    assertLeadEnvelopes((envelopes) => {
      const width = sortEnvelopes(envelopes).devices[0];

      if (envelopes.length !== 1 || width == null) {
        return `expected one device envelope, got ${
          envelopes.map((envelope) => envelope.parameter).join(", ") || "none"
        }`;
      }

      if (
        !LEAD_DEVICE_PATH.test(width.device ?? "") ||
        !/width/i.test(width.parameter)
      ) {
        return `expected a Width on a Lead device, got ${width.parameter} on ${width.device ?? "?"}`;
      }

      return risesOverTime(width) ? null : "Width should rise over the clip";
    }),

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for the Utility's Width on the Lead track to sweep from
narrow to wide over the Lead clip, using clip automation. Evaluate the final
reply: it says the Width automation was written on the Lead clip, and does not
claim to have changed anything else.`,
    },
  ],
};

export const automationWriteMixer: EvalScenario = {
  id: "automation-write-mixer",
  tags: ["automation"],
  description:
    "Automate volume, pan and a send on the Lead clip in one request",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",
  judgeAdvisory: true,
  requires: {
    tools: [TOOL_UPDATE_CLIP],
    params: ["envelopes"],
  },

  setup: (mcpClient) => seedLeadEnvelopes(mcpClient, []),

  messages: [
    MSG_CONNECT,
    "On the Lead clip, fade the volume in from silence to full, sweep the pan from hard left to hard right, and bring send A up from nothing to about half. Use clip automation.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    {
      type: "custom",
      description: "an envelopes write landed",
      assert: (turns) => envelopeWrites(turns).length > 0,
    },

    assertLeadEnvelopes((envelopes) => {
      const { volume, pan, sends, devices } = sortEnvelopes(envelopes);
      const problems: string[] = [];

      if (envelopes.length !== 3 || devices.length > 0) {
        problems.push(
          `expected exactly volume, pan and one send, got ${
            envelopes.map((envelope) => envelope.parameter).join(", ") || "none"
          }`,
        );
      }

      for (const [name, found] of [
        ["volume", volume],
        ["pan", pan],
        ["send", sends],
      ] as const) {
        const [only] = found;

        if (found.length !== 1 || only == null || !risesOverTime(only)) {
          problems.push(
            `${name} should be one envelope that rises over the clip`,
          );
        }
      }

      const volumeValues = envelopeValues(volume[0]?.events);
      const panValues = envelopeValues(pan[0]?.events);

      if ((volumeValues[0] ?? 1) > 0.3) {
        problems.push("volume should start near silence");
      }

      if ((panValues[0] ?? 0) >= 0 || (panValues.at(-1) ?? 0) <= 0) {
        problems.push("pan should start left of centre and end right of it");
      }

      return problems.length > 0 ? problems.join("; ") : null;
    }),

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for three automation envelopes on the Lead clip: volume
fading in from silence to full, pan sweeping hard left to hard right, and send A
rising from nothing to about half. Evaluate the final reply: it says all three
were written, and does not claim anything it didn't do.`,
    },
  ],
};
