// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Decide whether a scenario should be skipped under the active config profile,
 * and build the synthetic `skipped` result for runs that are.
 *
 * A scenario declares `requires` (transforms DSL, bracket notation, specific
 * tools, a large model). When the active profile can't satisfy a requirement —
 * e.g. the small-model profile doesn't teach the transforms DSL — the scenario
 * is reported as `skipped` instead of being run and failed, so small-model
 * scores stay apples-to-apples.
 */

import { SMALL_MODEL_EXCLUDED_PARAMS } from "#src/mcp-server/create-mcp-server.ts";
import { type ConfigProfile, type EvalScenario } from "../../types.ts";
import { type JsonEvalResult } from "./types.ts";

/**
 * Decide whether a scenario should be skipped under the given config profile.
 *
 * @param scenario - The scenario to check
 * @param profile - The active config profile
 * @returns A human-readable skip reason, or null if the scenario should run
 */
export function shouldSkipScenario(
  scenario: EvalScenario,
  profile: ConfigProfile,
): string | null {
  const req = scenario.requires;

  if (!req) return null;

  const config = profile.config;
  const smallModel = config.smallModelMode === true;

  if (req.transforms && smallModel) {
    return "requires the transforms DSL (not taught in small-model/basic skills)";
  }

  if (req.brackets && smallModel) {
    return "requires [...] stream notation (not taught in small-model/basic skills)";
  }

  if (req.largeModel && smallModel) {
    return "requires a large/frontier model (small-model mode active)";
  }

  if (req.params && smallModel) {
    const excluded = req.params.filter((p) =>
      SMALL_MODEL_EXCLUDED_PARAMS.has(p),
    );

    if (excluded.length > 0) {
      return `requires param(s) excluded in small-model mode: ${excluded.join(", ")}`;
    }
  }

  // Small-model mode excludes no whole standard tools, so only an explicit
  // profile tool allow-list is consulted here (the param surface is handled
  // by `requires.params` above). Today only the `default` profile sets `tools`.
  if (req.tools && config.tools) {
    const allowed = config.tools;
    const missing = req.tools.filter((tool) => !allowed.includes(tool));

    if (missing.length > 0) {
      return `profile excludes required tool(s): ${missing.join(", ")}`;
    }
  }

  return null;
}

/**
 * Build the synthetic JSON result for a scenario that was skipped before running.
 *
 * @param scenario - The skipped scenario
 * @param runId - Unique run identifier
 * @param model - Model key (e.g. "google/gemini-3.5-flash")
 * @param configProfileId - Active config profile ID
 * @param reason - Why the scenario was skipped
 * @returns A JsonEvalResult with `result: "skipped"`
 */
export function buildSkippedResult(
  scenario: EvalScenario,
  runId: string,
  model: string,
  configProfileId: string,
  reason: string,
): JsonEvalResult {
  return {
    version: 1,
    runId,
    timestamp: new Date().toISOString(),
    scenarioId: scenario.id,
    scenarioDescription: scenario.description,
    ...(scenario.kind && { kind: scenario.kind }),
    model,
    configProfileId,
    result: "skipped",
    skipReason: reason,
    turns: [],
    checks: { pass: false, results: [] },
    totalDurationMs: 0,
  };
}
