// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type EvalAssertion } from "../../types.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/**
 * The opening of a scenario that searches the library for a sample and builds on
 * a new track: connect, ppal-library, create-track.
 *
 * @returns The three leading assertions
 */
export function sampleBrowseAssertionHead(): EvalAssertion[] {
  return [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },
    { type: "tool_called", tool: TOOLS.library, turn: 1 },
    { type: "tool_called", tool: TOOLS.createTrack, turn: 2 },
  ];
}
