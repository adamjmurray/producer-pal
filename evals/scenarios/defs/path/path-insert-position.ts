// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: a create path can INSERT, not just append.
 *
 * `t+` and `s+` mean "at the end"; a numbered path on a create means "here, and
 * push everything after it down". `path-track-scene-address` covers the append
 * half. This is the other half, and it is the one that can go quietly wrong: an
 * insert that lands at the wrong index still creates a track, so only reading
 * the whole ordering back catches it.
 */

import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-scenario-helpers.ts";
import { trackNames } from "../live-set-helpers.ts";
import { assertCallResult, assertPathArg } from "./path-scenario-helpers.ts";

const TOOL_CREATE_TRACK = "ppal-create-track";
const TOOL_CREATE_SCENE = "ppal-create-scene";

const NEW_TRACK = "Perc";
const NEW_SCENE = "Intro";

/** Track names in order after Perc is inserted ahead of Lead. */
const TRACKS_AFTER_INSERT = ["Drums", "Bass", "Chords", NEW_TRACK, "Lead"];

/**
 * A result's `path`, whatever shape it came back in.
 * @param result - A parsed tool result
 * @returns The path, or ""
 */
function resultPath(result: Record<string, unknown>): string {
  return typeof result.path === "string" ? result.path : "";
}

export const pathInsertPosition: EvalScenario = {
  id: "path-insert-position",
  description: "Insert a track and a scene at a position, shifting the rest",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  messages: [
    MSG_CONNECT,
    `Insert a new MIDI track called ${NEW_TRACK} directly before the Lead track.`,
    `Insert a scene called ${NEW_SCENE} at the very top, above the current first scene.`,
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Lead is t3, so inserting before it IS t3 — the same spelling that reads
    // Lead. On a create it means "put it here", not "replace what's here".
    { type: "tool_called", tool: TOOL_CREATE_TRACK, turn: 1 },
    assertPathArg({
      turn: 1,
      tool: TOOL_CREATE_TRACK,
      param: "path",
      expected: "t3",
    }),
    assertCallResult({
      turn: 1,
      tool: TOOL_CREATE_TRACK,
      what: "the track landed at t3",
      check: (result) => resultPath(result) === "t3",
    }),

    { type: "tool_called", tool: TOOL_CREATE_SCENE, turn: 2 },
    assertPathArg({
      turn: 2,
      tool: TOOL_CREATE_SCENE,
      param: "path",
      expected: "s0",
    }),
    assertCallResult({
      turn: 2,
      tool: TOOL_CREATE_SCENE,
      what: "the scene landed at s0",
      check: (result) => resultPath(result) === "s0",
    }),

    // The measurement: Lead moved down instead of being overwritten. The
    // 5-MIDI track that hosts Producer Pal is left out — it sits after Lead and
    // is not what this grades.
    {
      type: "state",
      tool: "ppal-read-live-set",
      args: { include: ["tracks"] },
      expect: (result) =>
        trackNames(result).slice(0, TRACKS_AFTER_INSERT.length).join(",") ===
        TRACKS_AFTER_INSERT.join(","),
      explain: (result) =>
        `tracks are ${trackNames(result).join(", ")}, expected them to start ${TRACKS_AFTER_INSERT.join(", ")}`,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
  ],
};
