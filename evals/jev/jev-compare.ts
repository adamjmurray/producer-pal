#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Offline probe: re-judge saved eval results with Jev and measure how often it
 * agrees with the judge verdict stored in each result, or with sidecar verdicts
 * from `jev-rejudge.ts`. No Ableton needed.
 *
 * Run: node --env-file=.env evals/jev/jev-compare.ts [run-ids...] [flags]
 *   run-ids: run directories under evals/results (default: all)
 *   flags:   --scenario=id   only this scenario (repeatable)
 *            --limit=N       compare at most N results
 *            --concurrency=N parallel Jev calls (default 4)
 *            --via=route     typesafe, openrouter or vercel (default: the first
 *                            with its key set, in that order)
 *            --include-stale also use results recorded before the scenario's
 *                            judge criteria last changed
 *            --reference=slug use this sidecar judge (a folder under a run's
 *                            judges/, or provider/model) as the reference
 *                            instead of the stored verdict (repeatable). With
 *                            several, their majority is the reference; ties
 *                            are left out and listed as splits. Also reports
 *                            pairwise agreement and each judge's wrong calls.
 *            --results-dir=D results directory (default evals/results)
 *
 * The full per-result report goes to <results-dir>/jev-compare-<time>.json.
 */

import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { RESULTS_DIR } from "#evals/scenarios/helpers/json-results/types.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { parseJevRoute, resolveJevRoute, type JevRoute } from "./jev-client.ts";
import { jevJudge } from "./jev-judge.ts";
import { resolveReference, type Vote } from "./sidecar-judges/jev-reference.ts";
import { referenceLines } from "./sidecar-judges/jev-reference-report.ts";
import { formatReport, type CompareEntry } from "./jev-report.ts";
import {
  loadJudgedResults,
  type JudgedResult,
  type LoadOptions,
} from "./jev-results.ts";
import { judgeSlug, readSidecar } from "./sidecar-judges/jev-sidecar.ts";
import { mapConcurrent } from "./map-concurrent.ts";

const DEFAULT_CONCURRENCY = 4;

interface CliArgs {
  runIds?: string[];
  scenarioIds: string[];
  limit?: number;
  concurrency: number;
  via?: JevRoute;
  includeStale: boolean;
  /** Sidecar judge slugs to use as the reference; empty = the stored verdict */
  references: string[];
  resultsDir: string;
}

/** A loaded result and the sidecar votes on it (none in stored-judge mode). */
interface Candidate {
  item: JudgedResult;
  votes: Vote[];
}

/** Test seams: the Jev call and route, and how scenarios and criteria load. */
export interface CompareDeps {
  jev?: typeof jevJudge;
  route?: JevRoute;
  load?: Pick<LoadOptions, "scenarios" | "criteriaDate">;
  log?: (text: string) => void;
}

/**
 * Run the comparison and print the report.
 *
 * @param argv - Command-line arguments (without node and script path)
 * @param deps - Test seams
 * @returns Promise resolving once the report is printed and saved
 */
export async function runJevCompare(
  argv: string[],
  deps: CompareDeps = {},
): Promise<void> {
  const args = parseArgs(argv);
  const route = deps.route ?? resolveJevRoute(args.via).route;
  const log = deps.log ?? ((text: string) => console.log(text));
  const { items, skipped } = await loadJudgedResults({
    ...deps.load,
    runIds: args.runIds,
    scenarioIds: args.scenarioIds.length > 0 ? args.scenarioIds : undefined,
    includeStale: args.includeStale,
    includeUnjudged: args.references.length > 0,
    llmVerdictOnly: args.references.length === 0,
    resultsDir: args.resultsDir,
  });
  const candidates = await withVotes(items, args);
  const selected =
    args.limit == null ? candidates : candidates.slice(0, args.limit);

  log(
    `Judging ${selected.length} of ${candidates.length} saved result(s) with Jev via ${route}...`,
  );

  const entries = await mapConcurrent(selected, args.concurrency, (c) =>
    compareOne(c, route, deps.jev ?? jevJudge),
  );
  const lines = [
    ...formatReport(entries, skipped, route),
    ...(args.references.length > 0
      ? ["", ...referenceLines(entries, args.references)]
      : []),
  ];

  log(`\n${lines.join("\n")}`);

  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const path = join(args.resultsDir, `jev-compare-${stamp}.json`);

  await writeFile(path, JSON.stringify({ skipped, entries }, null, 2) + "\n");
  log(`\nFull report: ${path}`);
}

/**
 * Attach the sidecar votes to each result. With references, a result with no
 * vote from any of them is dropped.
 *
 * @param items - Loaded results
 * @param args - Parsed arguments
 * @returns The results to compare
 */
async function withVotes(
  items: JudgedResult[],
  args: CliArgs,
): Promise<Candidate[]> {
  if (args.references.length === 0) {
    return items.map((item) => ({ item, votes: [] }));
  }

  const out: Candidate[] = [];

  for (const item of items) {
    const votes: Vote[] = [];

    for (const slug of args.references) {
      const v = await readSidecar(
        args.resultsDir,
        item.file,
        slug,
        item.criteria,
      );

      if (v != null) {
        votes.push({ slug, pass: v.pass, issues: v.issues });
      }
    }

    if (votes.length > 0) {
      out.push({ item, votes });
    }
  }

  return out;
}

/**
 * Re-judge one saved result. A Jev failure is recorded, not thrown.
 *
 * @param candidate - The saved result, its criteria and any sidecar votes
 * @param route - The Jev route to call
 * @param jev - The Jev judge
 * @returns The comparison entry
 */
async function compareOne(
  candidate: Candidate,
  route: JevRoute,
  jev: typeof jevJudge,
): Promise<CompareEntry> {
  const { result, file, criteria } = candidate.item;
  const reference =
    candidate.votes.length > 0 ? resolveReference(candidate.votes) : undefined;
  const base = {
    file,
    scenarioId: result.scenarioId,
    judge: reference == null ? storedJudge(result) : voteJudge(reference.votes),
    reference,
    checksPass: result.checks.pass,
  };

  try {
    const answer = await jev(
      { turns: result.turns, checks: result.checks.results },
      criteria,
      { route },
    );

    return { ...base, jev: answer };
  } catch (error) {
    return { ...base, error: errorMessage(error) };
  }
}

/**
 * The verdict stored in the saved result.
 *
 * @param result - A saved result
 * @returns The stored verdict (a fail when there is none)
 */
function storedJudge(result: JudgedResult["result"]): CompareEntry["judge"] {
  return {
    pass: result.judge?.pass ?? false,
    issues: result.judge?.issues ?? [],
    advisory: result.judge?.advisory,
    provider: result.judge?.provider,
    model: result.judge?.model,
  };
}

/**
 * The sidecar votes as one verdict: their majority (a fail on a tie, which the
 * report leaves out), with the failing judges' issues.
 *
 * @param votes - The sidecar votes
 * @returns A verdict in the stored-judge shape
 */
function voteJudge(votes: Vote[]): CompareEntry["judge"] {
  const { majority } = resolveReference(votes);

  return {
    pass: majority ?? false,
    issues: votes.filter((v) => !v.pass).flatMap((v) => v.issues),
    provider:
      votes.length === 1 ? votes[0]?.slug : `majority of ${votes.length}`,
  };
}

/**
 * Parse command-line arguments.
 *
 * @param argv - Arguments
 * @returns Parsed options
 * @throws On an unknown `--via` route
 */
export function parseArgs(argv: string[]): CliArgs {
  const runIds = argv
    .filter((a) => !a.startsWith("--"))
    .map((a) => basename(a));
  const flag = (name: string): string[] =>
    argv
      .filter((a) => a.startsWith(`--${name}=`))
      .map((a) => a.slice(name.length + 3));

  const num = (name: string): number | undefined => {
    const n = Number(flag(name).at(-1));

    return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
  };

  return {
    runIds: runIds.length > 0 ? runIds : undefined,
    scenarioIds: flag("scenario"),
    limit: num("limit"),
    concurrency: num("concurrency") ?? DEFAULT_CONCURRENCY,
    via: parseJevRoute(flag("via").at(-1)),
    includeStale: argv.includes("--include-stale"),
    references: flag("reference").map(judgeSlug),
    resultsDir: flag("results-dir").at(-1) ?? RESULTS_DIR,
  };
}

if (import.meta.main) {
  await runJevCompare(process.argv.slice(2));
}
