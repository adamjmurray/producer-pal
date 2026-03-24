// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Helper functions for the scenario runner
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { type ConfigOptions } from "#evals/shared/config.ts";
import { type TokenUsage } from "#webui/chat/sdk/types.ts";
import {
  assertCustom,
  assertTokenUsage,
  assertToolCalled,
  assertState,
  assertResponseContains,
  type CheckSummary,
} from "./assertions/index.ts";
import { assertionLabel } from "./helpers/json-results/assertion-label.ts";
import {
  type EvalAssertion,
  type EvalAssertionResult,
  type EvalTurnResult,
  type MatrixConfigValues,
} from "./types.ts";

const LIVE_SETS_DIR = "evals/live-sets";

/**
 * Run a single correctness assertion (non-LLM judge)
 *
 * @param assertion - The assertion to evaluate
 * @param turns - Completed conversation turns
 * @param mcpClient - MCP client for state assertions
 * @returns Assertion result
 */
export async function runCorrectnessAssertion(
  assertion: EvalAssertion,
  turns: EvalTurnResult[],
  mcpClient: Client,
): Promise<EvalAssertionResult> {
  switch (assertion.type) {
    case "tool_called":
      return assertToolCalled(assertion, turns);
    case "state":
      return await assertState(assertion, mcpClient);
    case "response_contains":
      return assertResponseContains(assertion, turns);
    case "custom":
      return assertCustom(assertion, turns);
    case "token_usage":
      return assertTokenUsage(assertion, turns);
    default:
      return {
        assertion,
        earned: 0,
        maxScore: 0,
        message: `Unknown assertion type: ${(assertion as EvalAssertion).type}`,
      };
  }
}

/**
 * Convert correctness assertion results to check summaries for the judge prompt
 *
 * @param results - Correctness assertion results
 * @returns Array of check summaries
 */
export function toCheckSummaries(
  results: EvalAssertionResult[],
): CheckSummary[] {
  return results.map((r) => ({
    pass: r.earned === r.maxScore,
    label: assertionLabel(r.assertion),
    message: r.message,
  }));
}

/**
 * Merge scenario-bound config with matrix profile config.
 * Profile values override scenario values for any overlapping keys.
 *
 * @param scenarioConfig - Scenario-bound config (memory, sampleFolder)
 * @param profileConfig - Matrix profile config (smallModelMode, jsonOutput, tools)
 * @returns Merged config, or undefined if both inputs are empty
 */
export function mergeConfigs(
  scenarioConfig?: ConfigOptions,
  profileConfig?: MatrixConfigValues,
): ConfigOptions | undefined {
  if (!scenarioConfig && !profileConfig) return undefined;

  return { ...scenarioConfig, ...profileConfig };
}

/**
 * Validate config before sending to the server.
 * Throws if sampleFolder is set but the directory doesn't exist.
 *
 * @param config - Config to validate
 */
export function validateConfig(config: ConfigOptions): void {
  if (config.sampleFolder && !existsSync(config.sampleFolder)) {
    throw new Error(`sampleFolder does not exist: ${config.sampleFolder}`);
  }
}

/**
 * Resolve a liveSet value to a full path.
 * If it's a short name (no `/`), resolves to the Ableton project structure.
 *
 * @param liveSet - Short name or full path
 * @returns Full path to the .als file
 */
export function resolveLiveSetPath(liveSet: string): string {
  if (liveSet.includes("/")) {
    return liveSet;
  }

  // Ableton stores .als files in "{name} Project/{name}.als"
  return `${LIVE_SETS_DIR}/${liveSet} Project/${liveSet}.als`;
}

/**
 * Resolve a samples folder path to an absolute path within the live sets dir.
 * Short names (no `/`) resolve to `evals/live-sets/{name}`.
 *
 * @param folder - Short name (e.g. "samples") or absolute path
 * @returns Absolute path to the samples folder
 */
export function resolveSamplesPath(folder: string): string {
  if (folder.includes("/")) {
    return folder;
  }

  return resolve(LIVE_SETS_DIR, folder);
}

/**
 * Sum token usage across all steps of all turns.
 *
 * @param turns - Completed conversation turns with step usage data
 * @returns Total usage, or undefined if no usage data
 */
export function computeTotalUsage(
  turns: EvalTurnResult[],
): TokenUsage | undefined {
  let input = 0;
  let output = 0;
  let reasoning = 0;
  let hasUsage = false;

  for (const turn of turns) {
    for (const step of turn.stepUsages ?? []) {
      hasUsage = true;
      input += step.inputTokens ?? 0;
      output += step.outputTokens ?? 0;
      reasoning += step.reasoningTokens ?? 0;
    }
  }

  if (!hasUsage) return undefined;

  return {
    inputTokens: input,
    outputTokens: output,
    ...(reasoning > 0 && { reasoningTokens: reasoning }),
  };
}
