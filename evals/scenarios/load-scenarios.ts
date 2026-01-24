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
  /** Filter to specific scenario ID */
  scenarioId?: string;
  /** Filter to scenarios with specific tag */
  tag?: string;
  /** Override provider for all scenarios */
  provider?: EvalScenario["provider"];
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

  // Filter by scenario ID
  if (options?.scenarioId) {
    scenarios = scenarios.filter((s) => s.id === options.scenarioId);

    if (scenarios.length === 0) {
      const available = allScenarios.map((s) => s.id).join(", ");

      throw new Error(
        `Scenario not found: ${options.scenarioId}. Available: ${available}`,
      );
    }
  }

  // Filter by tag
  if (options?.tag) {
    const filterTag = options.tag;

    scenarios = scenarios.filter((s) => s.tags?.includes(filterTag));

    if (scenarios.length === 0) {
      throw new Error(`No scenarios found with tag: ${options.tag}`);
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

/**
 * List all available tags
 *
 * @returns Sorted array of unique tags
 */
export function listTags(): string[] {
  const tags = new Set<string>();

  for (const scenario of allScenarios) {
    for (const tag of scenario.tags ?? []) {
      tags.add(tag);
    }
  }

  return [...tags].sort();
}
