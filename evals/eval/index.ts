#!/usr/bin/env node

/**
 * CLI for running Producer Pal evaluation scenarios
 */

import { Command } from "commander";
import { loadScenarios, listScenarioIds } from "./load-scenarios.ts";
import { runScenario } from "./run-scenario.ts";
import type { EvalProvider, EvalScenarioResult } from "./types.ts";

interface CliOptions {
  test?: string;
  provider?: EvalProvider;
  model?: string;
  judge?: string;
  output?: string;
  list?: boolean;
  skipSetup?: boolean;
}

export interface JudgeOverride {
  provider: EvalProvider;
  model?: string;
}

/**
 * Parse a provider/model string into separate components
 *
 * @param llmString - String in format "provider" or "provider/model"
 * @returns Parsed provider and optional model
 */
function parseLlmString(llmString: string): JudgeOverride {
  const slashIndex = llmString.indexOf("/");
  const provider =
    slashIndex === -1 ? llmString : llmString.slice(0, slashIndex);
  const model = slashIndex === -1 ? undefined : llmString.slice(slashIndex + 1);

  const validProviders = ["anthropic", "gemini", "openai", "openrouter"];

  if (!validProviders.includes(provider)) {
    throw new Error(
      `Unknown provider: ${provider}. Valid: ${validProviders.join(", ")}`,
    );
  }

  return { provider: provider as EvalProvider, model: model ?? undefined };
}

const program = new Command();

program
  .name("eval")
  .description("Run Producer Pal evaluation scenarios against Ableton Live")
  .showHelpAfterError(true)
  .option("-t, --test <id>", "Run specific scenario by ID")
  .option(
    "-p, --provider <provider>",
    "LLM provider (gemini, openai, openrouter)",
  )
  .option("-m, --model <model>", "Override model")
  .option(
    "-j, --judge <provider/model>",
    "Override judge LLM (e.g., gemini/gemini-2.0-flash)",
  )
  .option("-o, --output <format>", "Output format (json)")
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
  if (!options.provider) {
    console.error("Error: -p, --provider is required when running tests");
    process.exit(1);
  }

  try {
    const scenarios = loadScenarios({
      testId: options.test,
      provider: options.provider,
      model: options.model,
    });

    if (scenarios.length === 0) {
      console.error("No scenarios to run.");
      process.exit(1);
    }

    // Parse judge override if provided
    const judgeOverride = options.judge
      ? parseLlmString(options.judge)
      : undefined;

    console.log(`Running ${scenarios.length} scenario(s)...`);

    const results: EvalScenarioResult[] = [];

    for (const scenario of scenarios) {
      const result = await runScenario(scenario, {
        skipLiveSetOpen: options.skipSetup,
        judgeOverride,
      });

      results.push(result);

      if (options.output !== "json") {
        printResult(result);
      }
    }

    if (options.output === "json") {
      console.log(JSON.stringify(results, null, 2));
    } else {
      printSummary(results);
    }

    // Exit with error code if any scenario failed
    const allPassed = results.every((r) => r.passed);

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
 * Print result for a single scenario
 *
 * @param result - The scenario result
 */
function printResult(result: EvalScenarioResult): void {
  const status = result.passed ? "PASSED" : "FAILED";
  const icon = result.passed ? "✓" : "✗";

  console.log(`\n${icon} ${result.scenario.id}: ${status}`);
  console.log(`  Duration: ${result.totalDurationMs}ms`);

  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }
}

/**
 * Print summary of all results
 *
 * @param results - All scenario results
 */
function printSummary(results: EvalScenarioResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  console.log("\n" + "=".repeat(50));
  console.log(`Summary: ${passed}/${results.length} passed`);

  if (failed > 0) {
    console.log(`\nFailed scenarios:`);

    for (const result of results.filter((r) => !r.passed)) {
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
