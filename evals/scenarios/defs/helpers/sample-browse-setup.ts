// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { resolveSamplesPath } from "../../run-scenario/scenario-config.ts";
import { type ConfigOptions } from "#evals/shared/config.ts";
import { type EvalAssertion } from "../../types.ts";

export const SAMPLE_FOLDER_CONFIG: ConfigOptions = {
  sampleFolder: resolveSamplesPath("samples"),
};

/**
 * The opening of a scenario that browses the eval samples folder and builds on
 * a new track: connect, ppal-library, create-track.
 *
 * @returns The three leading assertions
 */
export function sampleBrowseAssertionHead(): EvalAssertion[] {
  return [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },
    { type: "tool_called", tool: "ppal-library", turn: 1 },
    { type: "tool_called", tool: "ppal-create-track", turn: 2 },
  ];
}
