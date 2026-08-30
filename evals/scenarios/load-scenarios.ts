// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario loader - loads and filters evaluation scenarios
 */

import { styleText } from "node:util";
import {
  arpeggioBracketIdiom,
  arrangementClipWorkflow,
  audioSampleWorkflow,
  barBeatAbsoluteDurationUniformity,
  barBeatCompoundFeelPulse,
  barBeatGallop,
  barBeatMelodicCompoundStepping,
  barBeatMelodicLegatoRun,
  barBeatMelodicStepping,
  barBeatMeterFill,
  barBeatPerBarSpread,
  barBeatTriplets,
  barBeatVelocityAccent,
  barBeatZipStreams,
  connectToAbleton,
  contextFollowGlobal,
  contextFollowProject,
  contextMemoryDelete,
  contextMemoryNoSpuriousRecall,
  contextMemoryRecall,
  contextMemoryUpdateNotDuplicate,
  contextOnboardingNoImport,
  contextOnboardingOffer,
  contextOnboardingRecordsDecline,
  contextOnboardingStaysQuiet,
  contextWriteLayerGlobal,
  contextWriteLayerMemory,
  contextWriteLayerProject,
  contextWritePreserves,
  createAndEditClip,
  deleteTargets,
  deviceDrumKit,
  deviceSoundDesign,
  drumPadForceGuard,
  drumBackbeatMatrix,
  drumTransforms,
  duplicate,
  duplicateLoop,
  durationArgGrammar,
  durationReachForQuarter,
  legatoTransforms,
  librarySearchFanout,
  liveApiEscapeHatch,
  melodyPitchMatrix,
  melodyTransforms,
  middleCScaleMatrix,
  mixerLanguage,
  noteOpsMerge,
  noteOpsRatchetRoll,
  noteOpsRepeat,
  noteOpsSplit,
  pathArrangementAddress,
  pathSessionSlot,
  pathTakeLaneFirst,
  pathToPathClipDestinations,
  pathToPathDeviceAndPad,
  pathToPathPairing,
  pathUncommonRoots,
  rackPadOps,
  rangeClearBoundaries,
  pretransformsHatFillsBaseline,
  pretransformsMelodyReplaceBaseline,
  pretransformsSnareSwapBaseline,
  rhythmGridMatrix,
  sceneUpdateAndSelect,
  slmPretransformsDrumRemap,
  slmPretransformsRegionClear,
  surgicalNoteDurationEdit,
  swingAndQuantize,
  syncedLfoMeterInvariance,
  whereTransforms,
  projectContextWorkflow,
  negativeCases,
  sceneAndPlayback,
  trackAndDeviceWorkflow,
  updateLiveSet,
} from "./defs/index.ts";
import { shouldSkipScenario } from "./helpers/json-results/skip-scenario.ts";
import { envLabel, type RunEnv } from "./run-env/run-env.ts";
import { type EvalScenario } from "./types.ts";

/**
 * All registered scenarios
 */
const allScenarios: EvalScenario[] = [
  connectToAbleton,
  createAndEditClip,
  swingAndQuantize,
  whereTransforms,
  drumTransforms,
  legatoTransforms,
  melodyTransforms,
  trackAndDeviceWorkflow,
  mixerLanguage,
  deviceSoundDesign,
  deviceDrumKit,
  rackPadOps,
  drumPadForceGuard,
  projectContextWorkflow,
  // ppal-context behavior. Kept CONTIGUOUS and on one Live Set: each sets
  // `reuseLiveSet`, which only skips the (slow) reopen when the PRECEDING
  // scenario used the same Set — so the whole block pays for one open, not nine.
  contextFollowProject,
  contextFollowGlobal,
  contextMemoryRecall,
  contextMemoryNoSpuriousRecall,
  contextWriteLayerProject,
  contextWriteLayerGlobal,
  contextWriteLayerMemory,
  contextWritePreserves,
  contextMemoryUpdateNotDuplicate,
  contextMemoryDelete,
  contextOnboardingOffer,
  contextOnboardingNoImport,
  contextOnboardingRecordsDecline,
  contextOnboardingStaysQuiet,
  duplicate,
  duplicateLoop,
  negativeCases,
  arrangementClipWorkflow,
  audioSampleWorkflow,
  arpeggioBracketIdiom,
  sceneAndPlayback,
  sceneUpdateAndSelect,
  updateLiveSet,
  deleteTargets,
  liveApiEscapeHatch,
  librarySearchFanout,
  // Object-path addressing (2.2.0). Contiguous and on one Live Set:
  // path-session-slot resets the slots it writes, so it can reuse the open one.
  pathSessionSlot,
  pathToPathPairing,
  pathUncommonRoots,
  pathTakeLaneFirst,
  pathArrangementAddress,
  pathToPathClipDestinations,
  pathToPathDeviceAndPad,
  barBeatTriplets,
  barBeatMeterFill,
  barBeatAbsoluteDurationUniformity,
  barBeatCompoundFeelPulse,
  barBeatPerBarSpread,
  barBeatMelodicStepping,
  barBeatMelodicCompoundStepping,
  barBeatMelodicLegatoRun,
  barBeatVelocityAccent,
  barBeatGallop,
  barBeatZipStreams,
  pretransformsMelodyReplaceBaseline,
  pretransformsHatFillsBaseline,
  pretransformsSnareSwapBaseline,
  durationArgGrammar,
  durationReachForQuarter,
  syncedLfoMeterInvariance,
  slmPretransformsRegionClear,
  slmPretransformsDrumRemap,
  surgicalNoteDurationEdit,
  rangeClearBoundaries,
  noteOpsRatchetRoll,
  noteOpsMerge,
  noteOpsRepeat,
  noteOpsSplit,
  ...drumBackbeatMatrix,
  ...melodyPitchMatrix,
  ...rhythmGridMatrix,
  ...middleCScaleMatrix,
];

export interface LoadScenariosOptions {
  /** Filter to specific test/scenario IDs */
  testIds?: string[];
}

/**
 * Load and filter scenarios
 *
 * @param options - Filter options
 * @returns Filtered list of scenarios
 */
export function loadScenarios(options?: LoadScenariosOptions): EvalScenario[] {
  const testIds = options?.testIds;

  if (!testIds || testIds.length === 0) {
    return [...allScenarios];
  }

  const scenarios = allScenarios.filter((s) => testIds.includes(s.id));

  if (scenarios.length === 0) {
    const available = allScenarios.map((s) => s.id).join(", ");

    throw new Error(
      `Test(s) not found: ${testIds.join(", ")}. Available: ${available}`,
    );
  }

  // Warn about any IDs that weren't found
  const foundIds = new Set(scenarios.map((s) => s.id));
  const notFound = testIds.filter((id) => !foundIds.has(id));

  if (notFound.length > 0) {
    console.warn(`Warning: Test(s) not found: ${notFound.join(", ")}`);
  }

  return scenarios;
}

/**
 * List all available scenario IDs
 *
 * @returns Array of scenario IDs
 */
export function listScenarioIds(): string[] {
  return allScenarios.map((s) => s.id);
}

/**
 * List all scenarios with their kind and capability requirements for display
 *
 * @param env - Optional run environment; when given, each scenario carries the
 *   reason that environment would skip it (null when it would run)
 * @returns Array of {id, kind, requires, skipReason} objects
 */
export function listScenarioSummaries(env?: RunEnv): Array<{
  id: string;
  kind: "regression" | "capability";
  requires: string[];
  skipReason: string | null;
}> {
  return allScenarios.map((s) => ({
    id: s.id,
    kind: s.kind ?? "regression",
    requires: requirementLabels(s),
    skipReason: env == null ? null : shouldSkipScenario(s, env),
  }));
}

/**
 * Format a scenario's capability requirements as short display labels.
 *
 * @param scenario - The scenario to inspect
 * @returns Requirement labels (empty when the scenario has no `requires`)
 */
function requirementLabels(scenario: EvalScenario): string[] {
  const req = scenario.requires;

  if (!req) return [];

  const labels: string[] = [];

  if (req.transforms) labels.push("transforms");
  if (req.brackets) labels.push("brackets");
  if (req.largeModel) labels.push("largeModel");
  if (req.tools?.length) labels.push(`tools:${req.tools.join("+")}`);
  if (req.params?.length) labels.push(`params:${req.params.join("+")}`);

  return labels;
}

/**
 * Print available scenarios. With a run environment, each scenario the
 * environment can't satisfy is marked SKIP with its reason, and a footer counts
 * what would actually be graded — the answer to "what does a `--small-model`
 * run really score?" without paying for the run.
 *
 * @param env - The run environment the list is for (omit for the plain list)
 */
export function printList(env?: RunEnv): void {
  console.log("Available scenarios:");

  const summaries = listScenarioSummaries(env);

  for (const { id, kind, requires, skipReason } of summaries) {
    const kindLabel = styleText("gray", `[${kind}]`);
    const requiresLabel =
      requires.length > 0
        ? " " + styleText("yellow", `(requires: ${requires.join(", ")})`)
        : "";
    const skipLabel =
      skipReason == null ? "" : " " + styleText("red", `SKIP: ${skipReason}`);

    console.log(`  - ${id} ${kindLabel}${requiresLabel}${skipLabel}`);
  }

  if (env == null) return;

  printGradedCounts(summaries, env);
}

/**
 * Print how many scenarios a run environment actually grades, by kind.
 *
 * @param summaries - The listed scenarios, each with its skip reason
 * @param env - The run environment being summarized
 */
function printGradedCounts(
  summaries: Array<{ kind: string; skipReason: string | null }>,
  env: RunEnv,
): void {
  const graded = summaries.filter((s) => s.skipReason == null);
  const byKind = (kind: string) =>
    `${graded.filter((s) => s.kind === kind).length}/${
      summaries.filter((s) => s.kind === kind).length
    }`;

  console.log(
    `\n${envLabel(env)}: grades ${graded.length} of ${summaries.length} ` +
      `(regression ${byKind("regression")}, capability ${byKind("capability")})`,
  );
}
