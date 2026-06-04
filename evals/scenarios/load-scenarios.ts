// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario loader - loads and filters evaluation scenarios
 */

import { styleText } from "node:util";
import { listConfigProfileIds } from "./config-profiles.ts";
import {
  arpeggioBracketIdiom,
  arpeggioMixedDurations,
  arrangementClipWorkflow,
  audioSampleWorkflow,
  barBeatAbsoluteDurationUniformity,
  barBeatCompoundFeelPulse,
  barBeatGallop,
  barBeatMelodicCompoundStepping,
  barBeatMelodicLegatoRun,
  barBeatMelodicStepping,
  barBeatMeterFill,
  barBeatPerBarChord,
  barBeatPerBarNote,
  barBeatTriplets,
  barBeatVelocityAccent,
  connectToAbleton,
  createAndEditClip,
  deviceDrumKit,
  deviceSoundDesign,
  drumTransforms,
  duplicate,
  durationArgBarLength,
  durationArgMixedCombiner,
  durationArgSubBar,
  durationReachForQuarter,
  legatoTransforms,
  melodyTransforms,
  rangeClearFirstHalf,
  rangeClearWholeBar,
  pretransformsHatFillsBaseline,
  pretransformsMelodyReplaceBaseline,
  pretransformsSnareSwapBaseline,
  slmPretransformsDrumRemap,
  slmPretransformsRegionClear,
  surgicalNoteDurationEdit,
  swingAndQuantize,
  syncedLfoMeterInvariance,
  memoryWorkflow,
  negativeCases,
  sceneAndPlayback,
  trackAndDeviceWorkflow,
  updateLiveSet,
} from "./defs/index.ts";
import { type EvalScenario } from "./types.ts";

/**
 * All registered scenarios
 */
const allScenarios: EvalScenario[] = [
  connectToAbleton,
  createAndEditClip,
  swingAndQuantize,
  drumTransforms,
  legatoTransforms,
  melodyTransforms,
  trackAndDeviceWorkflow,
  deviceSoundDesign,
  deviceDrumKit,
  memoryWorkflow,
  duplicate,
  negativeCases,
  arrangementClipWorkflow,
  audioSampleWorkflow,
  arpeggioBracketIdiom,
  arpeggioMixedDurations,
  sceneAndPlayback,
  updateLiveSet,
  barBeatTriplets,
  barBeatMeterFill,
  barBeatAbsoluteDurationUniformity,
  barBeatCompoundFeelPulse,
  barBeatPerBarNote,
  barBeatPerBarChord,
  barBeatMelodicStepping,
  barBeatMelodicCompoundStepping,
  barBeatMelodicLegatoRun,
  barBeatVelocityAccent,
  barBeatGallop,
  pretransformsMelodyReplaceBaseline,
  pretransformsHatFillsBaseline,
  pretransformsSnareSwapBaseline,
  durationArgBarLength,
  durationArgSubBar,
  durationArgMixedCombiner,
  durationReachForQuarter,
  syncedLfoMeterInvariance,
  slmPretransformsRegionClear,
  slmPretransformsDrumRemap,
  surgicalNoteDurationEdit,
  rangeClearWholeBar,
  rangeClearFirstHalf,
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
 * List all scenarios with their kind for display
 *
 * @returns Array of {id, kind} objects
 */
export function listScenarioSummaries(): Array<{
  id: string;
  kind: "regression" | "capability";
}> {
  return allScenarios.map((s) => ({
    id: s.id,
    kind: s.kind ?? "regression",
  }));
}

/**
 * Print available scenarios and config profiles.
 */
export function printList(): void {
  console.log("Available scenarios:");

  for (const { id, kind } of listScenarioSummaries()) {
    const kindLabel = styleText("gray", `[${kind}]`);

    console.log(`  - ${id} ${kindLabel}`);
  }

  console.log("\nAvailable config profiles:");

  for (const id of listConfigProfileIds()) {
    console.log(`  - ${id}`);
  }
}
