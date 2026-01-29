#!/usr/bin/env node

/**
 * CLI for running Producer Pal evaluation scenarios
 */

import { Command } from "commander";
import { printResultsTable } from "./helpers/report-table.ts";
import { loadScenarios, listScenarioIds } from "./load-scenarios.ts";
import { runScenario } from "./run-scenario.ts";
import type { EvalProvider, EvalScenarioResult } from "./types.ts";

interface CliOptions {
  test: string[];
  model: string[];
  judge?: string;
  list?: boolean;
  skipSetup?: boolean;
}

export interface ModelSpec {
  provider: EvalProvider;
  model?: string;
}

export type { ModelSpec as JudgeOverride };

/**
 * Parse a provider/model string into separate components
 *
 * @param llmString - String in format "provider" or "provider/model"
 * @returns Parsed provider and optional model
 */
function parseLlmString(llmString: string): ModelSpec {
  const slashIndex = llmString.indexOf("/");
  const provider =
    slashIndex === -1 ? llmString : llmString.slice(0, slashIndex);
  const model = slashIndex === -1 ? undefined : llmString.slice(slashIndex + 1);

  const validProviders = ["anthropic", "google", "openai", "openrouter"];

  if (!validProviders.includes(provider)) {
    throw new Error(
      `Unknown provider: ${provider}. Valid: ${validProviders.join(", ")}`,
    );
  }

  return { provider: provider as EvalProvider, model: model ?? undefined };
}

/**
 * Collector function for multiple flag values
 *
 * @param value - Current flag value
 * @param previous - Previously collected values
 * @returns Updated array of values
 */
function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

const program = new Command();

program
  .name("eval")
  .description("Run Producer Pal evaluation scenarios against Ableton Live")
  .showHelpAfterError(true)
  .option(
    "-t, --test <id>",
    "Run specific scenario(s) by ID",
    collectValues,
    [],
  )
  .option(
    "-m, --model <provider/model>",
    "Model(s) to test (e.g., google, anthropic/claude-sonnet-4-5)",
    collectValues,
    [],
  )
  .option(
    "-j, --judge <provider/model>",
    "Override judge LLM (e.g., google/gemini-2.0-flash)",
  )
  .option("-l, --list", "List available scenarios")
  .option(
    "-s, --skip-setup",
    "Skip Live Set setup (use existing MCP connection)",
  )
  .action(async (options: CliOptions) => {
    if (options.list) {
      printList();

      return;
    }

    await runEvaluation(options);
  });

program.parse();

/**
 * Print available scenarios
 */
function printList(): void {
  console.log("Available scenarios:");

  for (const id of listScenarioIds()) {
    console.log(`  - ${id}`);
  }
}

/**
 * Run the evaluation with given options
 *
 * @param options - CLI options
 */
async function runEvaluation(options: CliOptions): Promise<void> {
  if (options.model.length === 0) {
    console.error("Error: -m, --model is required when running tests");
    process.exit(1);
  }

  try {
    // Parse all model specs upfront
    const modelSpecs = options.model.map(parseLlmString);

    const scenarios = loadScenarios({ testIds: options.test });

    if (scenarios.length === 0) {
      console.error("No scenarios to run.");
      process.exit(1);
    }

    // Parse judge override if provided
    const judgeOverride = options.judge
      ? parseLlmString(options.judge)
      : undefined;

    const totalRuns = scenarios.length * modelSpecs.length;

    console.log(
      `Running ${scenarios.length} scenario(s) × ${modelSpecs.length} model(s) = ${totalRuns} run(s)...`,
    );

    // Results keyed by scenarioId -> modelSpec -> result
    const resultsByScenario = new Map<
      string,
      Map<string, EvalScenarioResult>
    >();

    for (const scenario of scenarios) {
      const scenarioResults = new Map<string, EvalScenarioResult>();

      for (const spec of modelSpecs) {
        const modelKey = spec.model
          ? `${spec.provider}/${spec.model}`
          : spec.provider;
        const result = await runScenario(scenario, {
          provider: spec.provider,
          model: spec.model,
          skipLiveSetOpen: options.skipSetup,
          judgeOverride,
        });

        scenarioResults.set(modelKey, result);
        printResult(result, modelKey);
      }

      resultsByScenario.set(scenario.id, scenarioResults);
    }

    printSummary(resultsByScenario, modelSpecs);

    // Exit with error code if any scenario failed
    const allPassed = [...resultsByScenario.values()].every((scenarioResults) =>
      [...scenarioResults.values()].every((r) => r.passed),
    );

    process.exit(allPassed ? 0 : 1);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

/**
 * Print result for a single scenario run
 *
 * @param result - The scenario result
 * @param modelKey - The model identifier (provider or provider/model)
 */
function printResult(result: EvalScenarioResult, modelKey: string): void {
  const status = result.passed ? "PASSED" : "FAILED";
  const icon = result.passed ? "✓" : "✗";

  console.log(`\n${icon} ${result.scenario.id} [${modelKey}]: ${status}`);
  console.log(`  Duration: ${result.totalDurationMs}ms`);

  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
}

/**
 * Print summary of all results
 *
 * @param resultsByScenario - Results organized by scenario and model
 * @param modelSpecs - All model specs tested
 */
function printSummary(
  resultsByScenario: Map<string, Map<string, EvalScenarioResult>>,
  modelSpecs: ModelSpec[],
): void {
  // If multiple models, print a table
  if (modelSpecs.length > 1) {
    printResultsTable(resultsByScenario, modelSpecs);

    return;
  }

  // Single model - use simple summary
  const allResults = [...resultsByScenario.values()].flatMap((m) => [
    ...m.values(),
  ]);
  const passed = allResults.filter((r) => r.passed).length;
  const failed = allResults.length - passed;

  console.log("\n" + "=".repeat(50));
  console.log(`Summary: ${passed}/${allResults.length} passed`);

  if (failed > 0) {
    console.log(`\nFailed scenarios:`);

    for (const result of allResults.filter((r) => !r.passed)) {
      console.log(`  - ${result.scenario.id}`);

      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }

      for (const assertion of result.assertions.filter((a) => !a.passed)) {
        console.log(`    ✗ ${assertion.message}`);
      }
    }
  }
}
