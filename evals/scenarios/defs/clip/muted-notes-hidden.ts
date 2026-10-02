// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: a muted note stays out of a clip read.
 *
 * `ppal-read-clip` leaves muted notes out of `notes` and reports how many it
 * hid as `mutedNotes`. A user asking "what notes are in this clip?" means the
 * notes that play, so a reply that lists the muted pitch is wrong.
 *
 * No published tool can mute a note, so `setup` seeds one into the Lead clip
 * through `ppal-live-api`, which the model never sees. The muted pitch is B4,
 * which the clip doesn't otherwise use.
 *
 * Two assertions, kept apart so a miss on the second is visible on its own:
 *   - gating: the reply doesn't present B4 as a note in the clip.
 *   - signal: the reply mentions that a muted note exists.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type EvalScenario, type EvalTurnResult } from "../../types.ts";
import { seedMutedNote } from "../helpers/seed-muted-note.ts";
import { assertNotesRead } from "./helpers/clip-note-assertions.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_READ_CLIP,
} from "./helpers/clip-tool-constants.ts";

const LEAD_CLIP = "t3/s0";
/** The turn carrying the question; turn 0 is always connect. */
const ASK_TURN = 1;

/** B4 is MIDI 83 (C3 is 60 here). The Lead line only reaches F3. */
const MUTED_PITCH = 83;
/** The seeded pitch as the model would write it. */
const MUTED_NAME = /\bB4\b/;

/** The read-clip fields graded here. */
interface LeadRead {
  notes?: string;
  mutedNotes?: number;
}

/**
 * The reply doesn't offer the muted pitch as one of the clip's notes.
 *
 * @param turns - All conversation turns
 * @returns True when the reply never names B4
 */
function replyOmitsMutedPitch(turns: EvalTurnResult[]): boolean {
  const reply = turns[ASK_TURN]?.assistantResponse ?? "";

  if (reply.trim() === "") {
    throw new Error(`turn ${ASK_TURN} has no reply`);
  }

  if (MUTED_NAME.test(reply)) {
    throw new Error("the reply lists the muted B4 as a note in the clip");
  }

  return true;
}

export const mutedNotesHidden: EvalScenario = {
  id: "muted-notes-hidden",
  tags: ["clips"],
  description: "Leave a muted note out of the notes listed for a clip",
  kind: "regression",
  liveSet: "basic-with-drum-and-lead-clips",

  setup: (mcpClient: Client) =>
    seedMutedNote(mcpClient, LEAD_CLIP, {
      pitch: MUTED_PITCH,
      start: 6,
      duration: 1,
    }),

  messages: [MSG_CONNECT, "What notes are in the Lead clip?"],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    assertNotesRead(ASK_TURN),

    {
      type: "custom",
      description: "reply doesn't present the muted pitch as a note",
      assert: replyOmitsMutedPitch,
    },

    // Reads the clip back, so a seed that never took can't pass vacuously.
    {
      type: "state",
      tool: TOOL_READ_CLIP,
      args: { path: LEAD_CLIP, include: ["notes"] },
      expect: (result) => {
        const clip = result as LeadRead;

        return clip.mutedNotes === 1 && !MUTED_NAME.test(clip.notes ?? "");
      },
      explain: (result) => {
        const clip = result as LeadRead;

        return `expected one muted note kept out of notes, got mutedNotes ${String(clip.mutedNotes)}`;
      },
    },

    // Wording varies, so this is a signal, not a gate.
    { type: "response_contains", pattern: /mute/i, turn: ASK_TURN },

    { type: "token_usage", maxTokens: 1_500 },
  ],
};
