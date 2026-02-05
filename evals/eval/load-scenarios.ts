// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario loader - loads and filters evaluation scenarios
 */

import {
  connectToAbleton,
  createAndEditClip,
  duplicateAndTransform,
  projectNotesWorkflow,
  trackAndDeviceWorkflow,
} from "./scenario-defs/index.ts";
import type { EvalScenario } from "./types.ts";

/**
 * All registered scenarios
 */
const allScenarios: EvalScenario[] = [
  connectToAbleton,
  createAndEditClip,
  trackAndDeviceWorkflow,
  projectNotesWorkflow,
  duplicateAndTransform,
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
