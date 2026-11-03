// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Decide whether a scenario should be skipped under the active run environment,
 * and build the synthetic `skipped` result for runs that are.
 *
 * A scenario declares `requires` (transforms DSL, bracket notation, specific
 * tools, a small-model-excluded param, a large model). When the run environment
 * can't satisfy a requirement — e.g. small-model mode doesn't teach the
 * transforms DSL or hides a needed tool, or the `--tools` subset omits it — the scenario is
 * reported as `skipped` instead of being run and failed, so scores stay
 * apples-to-apples.
 */

import {
  SMALL_MODEL_EXCLUDED_PARAMS,
  SMALL_MODEL_HIDDEN_TOOLS,
} from "#src/mcp-server/create-mcp-server.ts";
import { toFullToolName } from "../../run-env/run-env.ts";
import { type EvalScenario } from "../../types.ts";
import { type JsonEvalResult } from "./types.ts";

/** The slice of the run environment that gates scenario requirements. */
interface SkipEnv {
  smallModelMode: boolean;
  /** Full tool names available this run (the resolved `--tools` subset). */
  tools: string[];
}

/**
 * Decide whether a scenario should be skipped under the given run environment.
 *
 * @param scenario - The scenario to check
 * @param env - The active run environment (small-model mode + tool subset)
 * @returns A human-readable skip reason, or null if the scenario should run
 */
export function shouldSkipScenario(
  scenario: EvalScenario,
  env: SkipEnv,
): string | null {
  const req = scenario.requires;

  if (!req) {
    return null;
  }

  const smallModel = env.smallModelMode;

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

  if (req.tools) {
    const required = req.tools.map(toFullToolName);

    // Small-model mode hides some whole tools (e.g. ppal-manage).
    const hidden = smallModel
      ? required.filter((tool) => SMALL_MODEL_HIDDEN_TOOLS.has(tool))
      : [];

    if (hidden.length > 0) {
      return `requires tool(s) hidden in small-model mode: ${hidden.join(", ")}`;
    }

    // Checked against the run's `--tools` subset. Bites only when the operator
    // restricts `--tools` below the required set.
    const missing = required.filter((tool) => !env.tools.includes(tool));

    if (missing.length > 0) {
      return `run's --tools subset excludes required tool(s): ${missing.join(", ")}`;
    }
  }

  return null;
}

/**
 * Build the synthetic JSON result for a scenario that was skipped before running.
 *
 * @param scenario - The skipped scenario
 * @param runId - Unique run identifier
 * @param model - Model key (e.g. "google/gemini-3.8-flash")
 * @param configProfileId - Run-environment label (see `envLabel`)
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
