/**
 * Scenario loader - loads and filters evaluation scenarios
 */

import { connectToAbleton } from "./scenario-defs/connect-to-ableton.ts";
import { createDrumBeat } from "./scenario-defs/create-drum-beat.ts";
import type { EvalScenario } from "./types.ts";

/**
 * All registered scenarios
 */
const allScenarios: EvalScenario[] = [connectToAbleton, createDrumBeat];

export interface LoadScenariosOptions {
  /** Filter to specific test/scenario ID */
  testId?: string;
}

/**
 * Load and filter scenarios
 *
 * @param options - Filter options
 * @returns Filtered list of scenarios
 */
export function loadScenarios(options?: LoadScenariosOptions): EvalScenario[] {
  if (!options?.testId) {
    return [...allScenarios];
  }

  const scenarios = allScenarios.filter((s) => s.id === options.testId);

  if (scenarios.length === 0) {
    const available = allScenarios.map((s) => s.id).join(", ");

    throw new Error(
      `Test not found: ${options.testId}. Available: ${available}`,
    );
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
