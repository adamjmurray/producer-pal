#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * CLI for running Producer Pal evaluation scenarios
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { styleText } from "node:util";
import { Command } from "commander";
import "#evals/shared/install-fetch-dispatcher.ts";
import { collapseStdoutNewlines } from "#evals/chat/shared/collapse-stdout-newlines.ts";
import { listModels } from "#evals/shared/list-models.ts";
import {
  LIST_MODELS_HINT,
  type ModelSpec,
  parseModelArgOrExit,
} from "#evals/shared/parse-model-arg.ts";
import { GEMINI_CONFIG } from "#evals/shared/provider-configs.ts";
import { type JevSettings } from "./helpers/judge/jev-first-judge.ts";
import { resolveJevSettings } from "./helpers/judge/jev-settings.ts";
import { generateRunId } from "./helpers/json-results/run-id.ts";
import { setQuietMode } from "./helpers/quiet-mode.ts";
import { type RunContext } from "./helpers/trials/run-trials.ts";
import { runAllScenarios } from "./helpers/trials/run-all-scenarios.ts";
import { printSummary } from "./helpers/reporting/summary-printer.ts";
import { parseRepeatCount } from "./helpers/trials/multi-trial-runs.ts";
import {
  loadScenarios,
  printList,
  printTags,
} from "./load-scenarios/load-scenarios.ts";
import { parseTagArgs } from "./load-scenarios/scenario-tags.ts";
import { buildRunEnv, envLabel, type RunEnv } from "./run-env/run-env.ts";
import { errorMessage } from "#src/shared/error-message.ts";

collapseStdoutNewlines();

export type { ModelSpec, ModelSpec as JudgeOverride };

interface CliOptions {
  test: string[];
  /** Tag filter (repeatable; each value may be a comma list). */
  tag: string[];
  model: string[];
  /** Enable small-model mode (basic skills tier + reduced param schemas). */
  smallModel?: boolean;
  /** Use JSON tool-result output (default: compact, the product default). */
  json?: boolean;
  /** Comma-separated tool subset (short or full names; default: all standard). */
  tools?: string;
  /** Enable the opt-in Direct Live API tool on top of the toolset. */
  liveApi?: boolean;
  judge?: string;
  /** Judge with Jev first; the LLM judge handles what Jev won't decide. */
  jev?: boolean;
  /** Jev route: typesafe, openrouter or vercel. */
  jevVia?: string;
  repeat?: string;
  list?: boolean;
  listTags?: boolean;
  listModels?: string | boolean;
  all?: boolean;
  /** Run the ordering canary subset from evals/canary-scenarios.txt. */
  canary?: boolean;
  skipSetup?: boolean;
  skipJudge?: boolean;
  skipReflection?: boolean;
  /** Whether to seed the opening connect turn (--no-seed-connect sets false). */
  seedConnect?: boolean;
  quiet?: boolean;
  usage?: boolean;
  /** Whether to write JSON result files to disk (--no-save sets false). */
  save?: boolean;
  baseUrl?: string;
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

/**
 * Read the ordering canary's scenario ids.
 *
 * The list is a checked-in file rather than a tag so that adding a scenario to
 * the gate stays a reviewable act. Blank lines and #-comments are ignored.
 *
 * @returns Scenario ids to run
 */
function readCanaryScenarios(): string[] {
  const path = fileURLToPath(
    new URL("../canary-scenarios.txt", import.meta.url),
  );

  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter((line) => line !== "");
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
    "--tag <name>",
    "Run scenarios carrying any of these tags (repeatable, comma-separated)",
    collectValues,
    [],
  )
  .option(
    "-m, --model <provider/model>",
    "Model(s) to test (e.g., gemini-3.8-flash, local/qwen3.8)",
    collectValues,
    [],
  )
  .option(
    "--small-model",
    "Enable small-model mode (basic skills + reduced param schemas)",
  )
  .option(
    "--json",
    "Use JSON tool-result output (default: compact, the product default)",
  )
  .option(
    "--tools <list>",
    "Comma-separated tool subset, short or full names (default: all standard tools)",
  )
  .option(
    "--live-api",
    "Enable the Direct Live API tool (ppal-live-api) on top of the toolset",
  )
  .option(
    "-j, --judge <provider/model>",
    `Override judge LLM (default: google/${GEMINI_CONFIG.defaultModel})`,
  )
  .option(
    "--jev",
    "Judge with Jev first; the -j LLM judge decides what Jev escalates",
  )
  .option(
    "--jev-via <route>",
    "Jev route: typesafe, openrouter or vercel (default: first with a key set)",
  )
  .option(
    "-r, --repeat <N>",
    "Run each scenario N times to detect flaky results (all scenarios once per round)",
  )
  .option("-l, --list", "List available scenarios")
  .option("--list-tags", "List scenario tags with their counts, then exit")
  .option(
    "--list-models [provider]",
    "List models for a provider (omit to list providers), then exit",
  )
  .option(
    "-s, --skip-setup",
    "Skip Live Set setup (use existing MCP connection)",
  )
  .option(
    "--skip-judge",
    "Skip the LLM-as-judge step (rely on deterministic checks only)",
  )
  .option(
    "--skip-reflection",
    "Skip the self-reflection turn injected after a deterministic failure",
  )
  .option(
    "--no-seed-connect",
    "Let the model run the opening connect turn instead of seeding it",
  )
  .option("-q, --quiet", "Suppress detailed AI and judge responses")
  .option("-u, --usage", "Show per-step token usage")
  .option("--no-save", "Skip writing JSON result files to disk")
  .option("-a, --all", "Run all scenarios")
  .option(
    "--canary",
    "Run the ordering canary subset (evals/canary-scenarios.txt)",
  )
  .option(
    "-b, --base-url <url>",
    "Base URL for local provider (default: http://localhost:11434/v1)",
  )
  .action(async (options: CliOptions) => {
    // Apply --base-url to env so the local provider picks it up
    if (options.baseUrl) {
      process.env.LOCAL_BASE_URL = options.baseUrl;
    }

    if (options.listModels != null) {
      process.exit(
        await listModels(options.listModels, { baseUrl: options.baseUrl }),
      );
    }

    if (options.listTags) {
      printTags();

      return;
    }

    if (options.list) {
      printList(buildRunEnv(options));

      return;
    }

    await runEvaluation(options);
  });

program.parse();

/**
 * Run the evaluation with given options
 *
 * @param options - CLI options
 */
async function runEvaluation(options: CliOptions): Promise<void> {
  setQuietMode(options.quiet ?? false);

  if (options.model.length === 0) {
    program.error(
      `-m, --model is required when running tests. ${LIST_MODELS_HINT}`,
    );
  }

  const tags = resolveSelection(options);

  const modelSpecs = options.model.map((model) =>
    parseModelArgOrExit(program, model),
  );
  const judgeOverride = parseModelArgOrExit(
    program,
    options.judge ?? GEMINI_CONFIG.defaultModel,
  );

  let jev: JevSettings | undefined;

  try {
    jev = resolveJevSettings(options);
  } catch (error) {
    program.error(errorMessage(error));

    return;
  }

  let runEnv: RunEnv;

  try {
    runEnv = buildRunEnv(options);
  } catch (error) {
    program.error(errorMessage(error));

    return;
  }

  const label = envLabel(runEnv);

  try {
    const scenarios = loadScenarios({
      testIds: options.all ? undefined : options.test,
      tags,
    });

    if (scenarios.length === 0) {
      console.error("No scenarios to run.");
      process.exit(1);
    }

    const repeatCount = parseRepeatCount(options.repeat);
    const totalRuns = scenarios.length * modelSpecs.length * repeatCount;
    const repeatLabel = repeatCount > 1 ? ` × ${repeatCount} trial(s)` : "";

    console.log(
      styleText(
        "bold",
        `Running ${scenarios.length} scenario(s) × ${modelSpecs.length} model(s)` +
          `${repeatLabel} = ${totalRuns} run(s)...`,
      ),
    );

    if (label !== "default") {
      console.log(styleText("gray", `Environment: ${label}`));
    }

    if (jev != null) {
      console.log(
        styleText(
          "gray",
          `Judge: Jev first (via ${jev.route}); LLM judge for escalations`,
        ),
      );
    } else if (options.jev && options.skipJudge) {
      console.log(styleText("gray", "--skip-judge: Jev is not used"));
    }

    const runId = generateRunId();
    const runCtx: RunContext = {
      runId,
      judgeOverride,
      jev,
      repeatCount,
      options,
    };

    const resultsByScenario = await runAllScenarios(
      scenarios,
      modelSpecs,
      runEnv,
      label,
      runCtx,
    );

    printSummary(resultsByScenario, modelSpecs, label);
  } catch (error) {
    console.error("Error:", errorMessage(error));
    process.exit(1);
  }
}

/**
 * Settle which scenarios the run asked for. `--canary` expands to its id list;
 * `-t` and `--tag` narrow (both given, a scenario has to match both); `-a` takes
 * everything and refuses to be narrowed.
 *
 * @param options - CLI options, mutated in place when --canary supplies the ids
 * @returns The requested tags (empty when none)
 */
function resolveSelection(options: CliOptions): string[] {
  const narrowed = options.test.length > 0 || options.tag.length > 0;

  if (options.canary) {
    if (options.all || narrowed) {
      program.error("--canary cannot be combined with --all, --test or --tag");
    }

    options.test = readCanaryScenarios();
    console.log(`Canary: ${options.test.length} scenarios`);

    return [];
  }

  if (options.all && narrowed) {
    program.error("--all cannot be combined with --test or --tag");
  }

  if (!options.all && !narrowed) {
    program.error(
      "must specify -t, --test <id>, --tag <name>, -a, --all, or --canary",
    );
  }

  try {
    return parseTagArgs(options.tag);
  } catch (error) {
    program.error(errorMessage(error));

    return [];
  }
}
