/**
 * Scenario loader - loads and filters evaluation scenarios
 */

import { connectToAbleton } from "./scenario-defs/connect-to-ableton.ts";
import { createDrumBeat } from "./scenario-defs/create-drum-beat.ts";
import type { EvalProvider, EvalScenario } from "./types.ts";

/**
 * All registered scenarios
 */
const allScenarios: EvalScenario[] = [connectToAbleton, createDrumBeat];

export interface LoadScenariosOptions {
  /** Filter to specific test/scenario ID */
  testId?: string;
  /** Provider to use for all scenarios (required from CLI) */
  provider?: EvalProvider;
  /** Override model for all scenarios */
  model?: string;
}

/**
 * Load and filter scenarios
 *
 * @param options - Filter and override options
 * @returns Filtered list of scenarios
 */
export function loadScenarios(options?: LoadScenariosOptions): EvalScenario[] {
  let scenarios = [...allScenarios];

  // Filter by test ID
  if (options?.testId) {
    scenarios = scenarios.filter((s) => s.id === options.testId);

    if (scenarios.length === 0) {
      const available = allScenarios.map((s) => s.id).join(", ");

      throw new Error(
        `Test not found: ${options.testId}. Available: ${available}`,
      );
    }
  }

  // Override provider if specified
  if (options?.provider) {
    const overrideProvider = options.provider;

    scenarios = scenarios.map((s) => ({
      ...s,
      provider: overrideProvider,
    }));
  }

  // Override model if specified
  if (options?.model) {
    const overrideModel = options.model;

    scenarios = scenarios.map((s) => ({
      ...s,
      model: overrideModel,
    }));
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
