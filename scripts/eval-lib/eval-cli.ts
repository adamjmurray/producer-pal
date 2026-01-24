#!/usr/bin/env node

/**
 * CLI for running Producer Pal evaluation scenarios
 */

import { Command } from "commander";
import { loadScenarios, listScenarioIds, listTags } from "./load-scenarios.ts";
import { runScenario } from "./run-scenario.ts";
import type {
  EvalAssertionResult,
  EvalProvider,
  EvalScenarioResult,
} from "./types.ts";

interface CliOptions {
  scenario?: string;
  tag?: string;
  provider?: EvalProvider;
  json?: boolean;
  verbose?: boolean;
  list?: boolean;
}

const program = new Command();

program
  .name("eval")
  .description("Run Producer Pal evaluation scenarios against Ableton Live")
  .showHelpAfterError(true)
  .option("-s, --scenario <id>", "Run specific scenario by ID")
  .option("-t, --tag <tag>", "Run scenarios with specific tag")
  .option(
    "-p, --provider <provider>",
    "Override provider (gemini, openai, openrouter)",
  )
  .option("--json", "Output results as JSON")
  .option("-v, --verbose", "Show detailed output including tool results")
  .option("-l, --list", "List available scenarios and tags")
  .action(async (options: CliOptions) => {
    if (options.list) {
      printList();

      return;
    }

    await runEvaluation(options);
  });

program.parse();

/**
 * Print available scenarios and tags
 */
function printList(): void {
  console.log("Available scenarios:");

  for (const id of listScenarioIds()) {
    console.log(`  - ${id}`);
  }

  console.log("\nAvailable tags:");

  for (const tag of listTags()) {
    console.log(`  - ${tag}`);
  }
}

/**
 * Run the evaluation with given options
 *
 * @param options - CLI options
 */
async function runEvaluation(options: CliOptions): Promise<void> {
  try {
    const scenarios = loadScenarios({
      scenarioId: options.scenario,
      tag: options.tag,
      provider: options.provider,
    });

    if (scenarios.length === 0) {
      console.error("No scenarios to run.");
      process.exit(1);
    }

    console.log(`Running ${scenarios.length} scenario(s)...`);

    const results: EvalScenarioResult[] = [];

    for (const scenario of scenarios) {
      const result = await runScenario(scenario);

      results.push(result);

      if (!options.json) {
        printResult(result, options.verbose);
      }
    }

    if (options.json) {
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
 * @param verbose - Whether to show verbose output
 */
function printResult(result: EvalScenarioResult, verbose?: boolean): void {
  const status = result.passed ? "PASSED" : "FAILED";
  const icon = result.passed ? "✓" : "✗";

  console.log(`\n${icon} ${result.scenario.id}: ${status}`);
  console.log(`  Duration: ${result.totalDurationMs}ms`);

  if (result.error) {
    console.log(`  Error: ${result.error}`);
  }

  if (verbose) {
    printVerboseResult(result);
  }
}

/**
 * Print verbose details for a result
 *
 * @param result - The scenario result to print
 */
function printVerboseResult(result: EvalScenarioResult): void {
  console.log(`\n  Turns:`);

  for (const turn of result.turns) {
    console.log(`    [${turn.turnIndex + 1}] User: ${turn.userMessage}`);
    console.log(
      `    [${turn.turnIndex + 1}] Assistant: ${turn.assistantResponse}`,
    );

    if (turn.toolCalls.length > 0) {
      printToolCalls(turn);
    }
  }

  printAssertions(result.assertions);
}

/**
 * Print assertions for a result
 *
 * @param assertions - The assertions to print
 */
function printAssertions(assertions: EvalAssertionResult[]): void {
  console.log(`\n  Assertions:`);

  for (const assertion of assertions) {
    const aIcon = assertion.passed ? "✓" : "✗";

    console.log(`    ${aIcon} ${assertion.message}`);

    if (!assertion.passed && assertion.details) {
      console.log(`      Details: ${JSON.stringify(assertion.details)}`);
    }
  }
}

/**
 * Print tool calls for a turn
 *
 * @param turn - The turn containing tool calls to print
 */
function printToolCalls(turn: EvalScenarioResult["turns"][0]): void {
  console.log(`    [${turn.turnIndex + 1}] Tools:`);

  for (const tc of turn.toolCalls) {
    console.log(`      - ${tc.name}(${JSON.stringify(tc.args)})`);

    if (tc.result) {
      const truncated = tc.result.length > 200;
      const display = truncated ? tc.result.slice(0, 200) + "..." : tc.result;

      console.log(`        Result: ${display}`);
    }
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
