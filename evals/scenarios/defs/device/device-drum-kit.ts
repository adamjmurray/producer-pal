// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Drum-kit capability: can the model build a Drum Rack in ONE device call using
 * path-prefixed sample params?
 *
 * Requires Ableton (agentic — drives a live model against Live).
 *
 * The kit grammar is a single create-device with `deviceName: "Drum Rack"` and
 * `params` whose names are pad-path prefixed — `{name: "pC1/sample", value:
 * "<abs file path>"}` loads a sample into pad C1, auto-creating that pad's
 * Simpler. The capability is "one call, many pads", NOT pad-by-pad add-device
 * loops. The eval samples folder ships `drums/kick.aiff` + `sample.aiff`, so the
 * kit is two pads (C1, D1) — enough to grade the multi-pad single-call build.
 *
 * Grading is path-independent (the model names its own track): we find ONE
 * device call carrying >= 2 pad-path sample params and confirm the engine took
 * it (no relayed `WARNING` on that call).
 */

import { argText } from "../arg-text.ts";
import { getToolCalls } from "../../assertions/index.ts";
import { resolveSamplesPath } from "../../run-scenario-helpers.ts";
import { type EvalScenario, type EvalTurnResult } from "../../types.ts";

/**
 * A pad-path sample param. The published spelling is the short `pC1/sample`,
 * which is what both device defs show and what models write; the chain and
 * device segments are optional (`pC1/d0/sample`, `pC#1/c0/d0/sample`). All of
 * them reach the same Simpler — `ppal-create-device-drum-kit` proves the short
 * and long forms in one call against real Live — so grading only the long form
 * failed the exact call the tool description asks for.
 */
const PAD_SAMPLE_PARAM = /^p[^/]+(?:\/c\d+)?(?:\/d\d+)?\/sample$/i;

export const deviceDrumKit: EvalScenario = {
  id: "device-drum-kit",
  description:
    "Build a Drum Rack in one call with path-prefixed per-pad sample params",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  config: {
    sampleFolder: resolveSamplesPath("samples"),
  },

  messages: [
    "Connect to Ableton Live",
    "Show me the available samples.",
    "Make a new MIDI track and build a Drum Rack on it in a single step: put the kick on pad C1 and the other sample on pad D1.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },
    { type: "tool_called", tool: "ppal-library", turn: 1 },
    { type: "tool_called", tool: "ppal-create-track", turn: 2 },
    { type: "tool_called", tool: "ppal-create-device", turn: 2 },

    // One device call must carry >= 2 distinct pad-path sample params, accepted.
    {
      type: "custom",
      description:
        "kit built in one device call with >=2 path-prefixed pad samples",
      assert: (turns: EvalTurnResult[]) => {
        const deviceCalls = getToolCalls(turns, 2).filter(
          (c) =>
            c.name === "ppal-create-device" || c.name === "ppal-update-device",
        );

        const oneCallKit = deviceCalls.find((c) => {
          if (!Array.isArray(c.args.params)) return false;

          const padPads = new Set(
            (c.args.params as Array<{ name?: unknown }>)
              .map((p) => argText(p.name))
              .filter((name) => PAD_SAMPLE_PARAM.test(name)),
          );

          return padPads.size >= 2;
        });

        if (!oneCallKit) {
          throw new Error(
            "no single device call loaded >=2 pads via path-prefixed sample params (built pad-by-pad instead of in one call?)",
          );
        }

        // Warnings ride on the call's `warnings`, not its `result`: the relay
        // appends each one as its own content block after the payload.
        if ((oneCallKit.warnings?.length ?? 0) > 0) {
          throw new Error(
            `the kit-build call warned — a sample failed to load (bad path or pad address): ${(oneCallKit.warnings ?? []).join("; ")}`,
          );
        }

        return true;
      },
    },

    {
      type: "response_contains",
      pattern: /drum|kit|pad|rack/i,
      turn: 2,
    },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 80_000,
    },
  ],
};
