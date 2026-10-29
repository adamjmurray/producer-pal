#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Offline re-judge: run the production LLM judge (`assertWithLlmJudge`) over
 * saved eval results. No Ableton, no re-running the model. Verdicts go to
 * sidecar files (`<run>/judges/<judge-slug>/<result-file>`); results are never
 * changed. Re-runs skip results the judge already did on the current criteria.
 * A failed judge call saves nothing, so the next run retries it.
 *
 * Run: node --env-file=.env evals/jev/sidecar-judges/jev-rejudge.ts \
 *        [run-ids...] -j <provider/model> [flags]
 *   -j, --judge <provider/model>  same format as the eval CLI's -j
 * Flags:
 *   --scenario=id  only this scenario (repeatable)
 *   --limit=N      judge at most N results now (after skipping done ones)
 *   --concurrency=N  parallel judge calls (default 4)
 *   --sample=fails+N  results the stored outcome marks as fail, plus N random
 *                  passes; --seed=S makes the pick repeatable (default 1)
 *   --fails-from=slug  also count what this sidecar judge failed as a fail
 *                  for --sample (repeatable)
 *   --include-failed-checks  also judge results whose gating checks failed
 *                  (default: gating-passed only, where the judge decides)
 *   --include-stale  keep results recorded before the criteria last changed
 *   --force        judge again even when a sidecar exists
 *   --dry-run      count what would be judged; make no calls
 *   --results-dir=D  default evals/results
 */

import { performance } from "node:perf_hooks";
import { parseModelArg } from "#evals/shared/parse-model-arg.ts";
import {
  assertWithLlmJudge,
  LLM_JUDGE_ERROR_PREFIX,
  type LlmJudgeDetails,
} from "#evals/scenarios/assertions/llm-judge.ts";
import { RESULTS_DIR } from "#evals/scenarios/helpers/json-results/types.ts";
import {
  loadJudgedResults,
  type JudgedResult,
  type LoadOptions,
} from "../jev-results.ts";
import {
  selectEligible,
  parseSample,
  sampleResults,
} from "./jev-rejudge-select.ts";
import {
  criteriaHash,
  judgeSlug,
  readSidecar,
  writeSidecar,
} from "./jev-sidecar.ts";
import { mapConcurrent } from "../map-concurrent.ts";

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_SEED = 1;

export interface RejudgeArgs {
  runIds?: string[];
  judge: string;
  scenarioIds: string[];
  limit?: number;
  concurrency: number;
  /** Passes to sample on top of the fails */
  samplePasses?: number;
  seed: number;
  failsFrom: string[];
  includeFailedChecks: boolean;
  includeStale: boolean;
  force: boolean;
  dryRun: boolean;
  resultsDir: string;
}

/** Counts from one run, for the report and for tests. */
export interface RejudgeSummary {
  slug: string;
  loaded: number;
  eligible: number;
  sampled: number;
  alreadyJudged: number;
  judged: number;
  passed: number;
  failed: number;
  errors: number;
}

/** Test seams: the judge call, and how scenarios and criteria dates load. */
export interface RejudgeDeps {
  judge?: typeof assertWithLlmJudge;
  load?: Pick<LoadOptions, "scenarios" | "criteriaDate">;
  log?: (line: string) => void;
  now?: () => Date;
}

/**
 * Re-judge saved results and write sidecars.
 *
 * @param argv - Command-line arguments (without node and script path)
 * @param deps - Test seams
 * @returns Counts of what was selected and judged
 */
export async function runRejudge(
  argv: string[],
  deps: RejudgeDeps = {},
): Promise<RejudgeSummary> {
  const args = parseRejudgeArgs(argv);
  const log = deps.log ?? ((line: string) => console.log(line));
  const spec = parseModelArg(args.judge);
  const slug = judgeSlug(`${spec.provider}/${spec.model}`);
  const { items, skipped } = await loadJudgedResults({
    ...deps.load,
    runIds: args.runIds,
    scenarioIds: args.scenarioIds.length > 0 ? args.scenarioIds : undefined,
    includeStale: args.includeStale,
    includeUnjudged: true,
    resultsDir: args.resultsDir,
  });
  const eligible = selectEligible(items, args.includeFailedChecks).filter(
    (i) => i.result.turns.length > 0,
  );
  const sampled = await applySample(eligible, args);
  const todo = await dropJudged(sampled, args, slug);
  const selected = args.limit == null ? todo : todo.slice(0, args.limit);
  const summary: RejudgeSummary = {
    slug,
    loaded: items.length,
    eligible: eligible.length,
    sampled: sampled.length,
    alreadyJudged: sampled.length - todo.length,
    judged: 0,
    passed: 0,
    failed: 0,
    errors: 0,
  };

  log(
    `Loaded ${items.length} result(s) with an llm_judge ` +
      `(left out: ${skipped.notScored} skipped/error, ${skipped.noScenario} unknown scenario, ${skipped.noLlmJudge} no llm_judge, ${skipped.unreadable} unreadable, ${skipped.staleCriteria} stale criteria).`,
  );
  log(
    `${eligible.length} eligible${args.includeFailedChecks ? "" : " (gating checks passed)"}; ` +
      `${sampled.length} after sampling; ${summary.alreadyJudged} already judged by ${slug}; ` +
      `${selected.length} to judge now.`,
  );

  if (args.dryRun) {
    return summary;
  }

  const run = deps.judge ?? assertWithLlmJudge;
  const now = deps.now ?? ((): Date => new Date());
  let done = 0;

  await mapConcurrent(selected, args.concurrency, async (item) => {
    const outcome = await judgeOne(item, { run, spec, slug, args, now });

    done++;

    if (outcome === "error") {
      summary.errors++;
    } else {
      summary.judged++;
      summary[outcome]++;
    }

    log(`[${done}/${selected.length}] ${item.file}: ${outcome}`);
  });

  log(
    `Judged ${summary.judged} with ${slug}: ${summary.passed} pass, ${summary.failed} fail; ${summary.errors} error(s) (not saved, will retry).`,
  );

  return summary;
}

interface JudgeContext {
  run: typeof assertWithLlmJudge;
  spec: ReturnType<typeof parseModelArg>;
  slug: string;
  args: RejudgeArgs;
  now: () => Date;
}

/**
 * Judge one result and save the verdict. A judge error is not saved.
 *
 * @param item - The saved result and its criteria
 * @param ctx - Judge, its slug, args and clock
 * @returns "passed", "failed", or "error"
 */
async function judgeOne(
  item: JudgedResult,
  ctx: JudgeContext,
): Promise<"passed" | "failed" | "error"> {
  const { result, criteria, file } = item;
  const { spec, slug, args } = ctx;
  const started = performance.now();
  let outcome;

  try {
    outcome = await ctx.run(
      { type: "llm_judge", prompt: criteria },
      result.turns,
      spec.provider,
      spec,
      result.checks.results,
    );
  } catch {
    return "error";
  }

  if (outcome.message.startsWith(LLM_JUDGE_ERROR_PREFIX)) {
    return "error";
  }

  const details = outcome.details as LlmJudgeDetails;

  await writeSidecar(args.resultsDir, {
    version: 1,
    file,
    scenarioId: result.scenarioId,
    slug,
    judge: {
      provider: details.provider ?? spec.provider,
      requestedModel: spec.model,
      model: details.model,
    },
    criteriaHash: criteriaHash(criteria),
    judgedAt: ctx.now().toISOString(),
    durationMs: Math.round(performance.now() - started),
    checksPass: result.checks.pass,
    pass: details.pass,
    issues: details.issues,
  });

  return details.pass ? "passed" : "failed";
}

/**
 * Apply `--sample`, if given.
 *
 * @param eligible - Results the judge decides
 * @param args - Parsed arguments
 * @returns Every fail plus the sampled passes, or all when not sampling
 */
async function applySample(
  eligible: JudgedResult[],
  args: RejudgeArgs,
): Promise<JudgedResult[]> {
  if (args.samplePasses == null) {
    return eligible;
  }

  const failedFiles = new Set<string>();

  for (const slug of args.failsFrom.map(judgeSlug)) {
    for (const item of eligible) {
      const v = await readSidecar(
        args.resultsDir,
        item.file,
        slug,
        item.criteria,
      );

      if (v != null && !v.pass) {
        failedFiles.add(item.file);
      }
    }
  }

  return sampleResults(
    eligible,
    { passes: args.samplePasses, seed: args.seed },
    failedFiles,
  );
}

/**
 * Drop results this judge already judged on the current criteria.
 *
 * @param items - Results to judge
 * @param args - Parsed arguments
 * @param slug - The judge slug
 * @returns The results still to judge (all of them with `--force`)
 */
async function dropJudged(
  items: JudgedResult[],
  args: RejudgeArgs,
  slug: string,
): Promise<JudgedResult[]> {
  if (args.force) {
    return items;
  }

  const todo: JudgedResult[] = [];

  for (const item of items) {
    const done = await readSidecar(
      args.resultsDir,
      item.file,
      slug,
      item.criteria,
    );

    if (done == null) {
      todo.push(item);
    }
  }

  return todo;
}

/**
 * Parse command-line arguments.
 *
 * @param argv - Arguments
 * @returns Parsed options
 * @throws On a missing judge or a bad `--sample`
 */
export function parseRejudgeArgs(argv: string[]): RejudgeArgs {
  const positional: string[] = [];
  const flags = new Map<string, string[]>();
  let judge: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;

    if (arg === "-j" || arg === "--judge") {
      judge = argv[++i];
    } else if (arg.startsWith("--judge=")) {
      judge = arg.slice("--judge=".length);
    } else if (arg.startsWith("--")) {
      const [name = "", ...rest] = arg.slice(2).split("=");

      flags.set(name, [...(flags.get(name) ?? []), rest.join("=")]);
    } else {
      positional.push(arg);
    }
  }

  if (judge == null || judge === "") {
    throw new Error("Missing -j/--judge <provider/model>");
  }

  const num = (name: string): number | undefined => {
    const n = Number(flags.get(name)?.at(-1));

    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
  };

  const has = (name: string): boolean => flags.has(name);
  const sample = flags.get("sample")?.at(-1);

  return {
    runIds: positional.length > 0 ? positional.map(runIdOf) : undefined,
    judge,
    scenarioIds: flags.get("scenario") ?? [],
    limit: num("limit"),
    concurrency: num("concurrency") ?? DEFAULT_CONCURRENCY,
    samplePasses: sample == null ? undefined : parseSample(sample),
    seed: Number(flags.get("seed")?.at(-1) ?? DEFAULT_SEED),
    failsFrom: flags.get("fails-from") ?? [],
    includeFailedChecks: has("include-failed-checks"),
    includeStale: has("include-stale"),
    force: has("force"),
    dryRun: has("dry-run"),
    resultsDir: flags.get("results-dir")?.at(-1) ?? RESULTS_DIR,
  };
}

/**
 * A run id from a run id or a path to its directory.
 *
 * @param arg - A positional argument
 * @returns The last path segment
 */
function runIdOf(arg: string): string {
  return arg.replace(/\/+$/, "").split("/").at(-1) ?? arg;
}

if (import.meta.main) {
  await runRejudge(process.argv.slice(2));
}
