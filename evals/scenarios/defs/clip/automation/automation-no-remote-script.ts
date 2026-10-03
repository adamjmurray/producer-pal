// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: asked for clip automation on a Live with no remote script, the
 * model says it can't instead of pretending.
 *
 * `config.remoteScriptEnabled: false` makes the running remote script look
 * uninstalled: the Clip Automation skill isn't taught, and the `envelopes`
 * param answers that the remote script isn't running. The runner applies the
 * config before the session starts and `resetConfig()` turns it back on in its
 * `finally`, so the next scenario keeps the script whether this one passes,
 * fails, or throws in `setup`. That's why this uses `config`, not a
 * setup/teardown pair.
 *
 * Gated on outcome: no envelope write landed. The judge grades the reply.
 */

import { type EvalScenario } from "../../../types.ts";
import { MSG_CONNECT, TOOL_CONNECT } from "../helpers/clip-tool-constants.ts";
import {
  envelopeWrites,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-envelope-readback.ts";

/** The turn carrying the request; turn 0 is always connect. */
const ASK_TURN = 1;

export const automationNoRemoteScript: EvalScenario = {
  id: "automation-no-remote-script",
  tags: ["automation"],
  description:
    "Asked for clip automation with no remote script, say it can't be done",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",
  config: { remoteScriptEnabled: false },
  requires: {
    tools: [TOOL_UPDATE_CLIP],
    params: ["envelopes"],
  },

  messages: [
    MSG_CONNECT,
    "Fade the Lead clip's volume in from silence with clip automation.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    {
      type: "custom",
      description: "no automation write landed",
      assert: (turns) => envelopeWrites(turns).length === 0,
    },

    // Wording varies, so this is a signal, not a gate.
    {
      type: "response_contains",
      pattern: /remote script|can'?t|cannot|unable|not (?:available|possible)/i,
      turn: ASK_TURN,
    },

    { type: "token_usage", maxTokens: 3_000 },

    {
      type: "llm_judge",
      prompt: `The Producer Pal remote script, which clip automation needs, is not running
in this Live. Automation can't be written or read at all.

Evaluate the assistant's final reply to "Fade the Lead clip's volume in from
silence with clip automation":
1. It tells the user the automation couldn't be done, and says why (the remote
   script isn't running or isn't installed, or that automation isn't available).
2. It does NOT claim the volume fade was written, and does not pass off
   something else as automation (e.g. a changed fader level or a note-velocity
   fade) without saying it is not automation.
3. Offering a workaround, or asking the user to set up the remote script, is
   fine.`,
    },
  ],
};
