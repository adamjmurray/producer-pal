// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * The config a scenario run sends to the server, and the Live Set and sample
 * paths it resolves.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type ConfigOptions } from "#evals/shared/config.ts";
import { type RunEnv } from "../run-env/run-env.ts";

const LIVE_SETS_DIR = "evals/live-sets";

/**
 * Build the config POSTed to the server for a run. The run environment (CLI
 * flags) wins for its four keys; the scenario keeps its own bound config.
 * @param scenarioConfig - Scenario-bound config (projectContext, sampleFolder)
 * @param runEnv - The active run environment (CLI-driven)
 * @returns The merged config to send to the server
 */
export function mergeConfigs(
  scenarioConfig: ConfigOptions | undefined,
  runEnv: RunEnv,
): ConfigOptions {
  return {
    ...scenarioConfig,
    smallModelMode: runEnv.smallModelMode,
    jsonOutput: runEnv.jsonOutput,
    tools: runEnv.tools,
    liveApiEnabled: runEnv.liveApiEnabled,
  };
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
