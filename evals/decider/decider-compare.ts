#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Offline probe: re-judge saved eval results with the decider and measure how often it
 * agrees with the judge verdict stored in each result, or with sidecar verdicts
 * from `decider-rejudge.ts`. No Ableton needed.
 *
 * Run: node --env-file=.env evals/decider/decider-compare.ts [run-ids...] [flags]
 *   run-ids: run directories under evals/results (default: all)
 *   flags:   --scenario=id   only this scenario (repeatable)
 *            --limit=N       compare at most N results
 *            --concurrency=N parallel decider calls (default 4; 1 for ollama)
 *            --decider=D     jev (default), typesafe|openrouter|vercel, or
 *                            provider/model, e.g. ollama/autotrust-jev
 *            --include-stale also use results recorded before the scenario's
 *                            judge criteria last changed
 *            --reference=slug use this sidecar judge (a judges/ folder, or
 *                            provider/model) as the reference instead of the
 *                            stored verdict (repeatable; several: majority,
 *                            ties left out and listed as splits)
 *            --recorded      use the decider answers a `--decider` run saved
 *                            (no calls; not with --decider)
 *            --results-dir=D results directory (default evals/results)
 *
 * The full per-result report goes to <results-dir>/decider-compare-<time>.json.
 */

import { writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { RESULTS_DIR } from "#evals/scenarios/helpers/json-results/types.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  defaultConcurrency,
  parseDeciderSpec,
  resolveDecider,
  type DeciderSpec,
  type ResolvedDecider,
} from "./decider-provider.ts";
import { deciderJudge } from "./decider-judge.ts";
import { recordedDecider } from "./decider-recorded.ts";
import {
  resolveReference,
  type Vote,
} from "./sidecar-judges/decider-reference.ts";
import { referenceLines } from "./sidecar-judges/decider-reference-report.ts";
import { formatReport, type CompareEntry } from "./report/decider-report.ts";
import {
  judgeChecks,
  loadJudgedResults,
  type JudgedResult,
  type LoadOptions,
} from "./decider-results.ts";
import { judgeSlug, readSidecar } from "./sidecar-judges/decider-sidecar.ts";
import { mapConcurrent } from "./map-concurrent.ts";

interface CliArgs {
  runIds?: string[];
  scenarioIds: string[];
  limit?: number;
  /** Set only when the user gave `--concurrency`; the provider decides otherwise */
  concurrency?: number;
  /** What `--decider` named; undefined takes the default hosted provider */
  decider?: DeciderSpec;
  includeStale: boolean;
  /** Use the decider answers saved in the results instead of calling the decider */
  recorded: boolean;
  /** Sidecar judge slugs to use as the reference; empty = the stored verdict */
  references: string[];
  resultsDir: string;
}

/** A loaded result and the sidecar votes on it (none in stored-judge mode). */
interface Candidate {
  item: JudgedResult;
  votes: Vote[];
}

/** Test seams: the decider call and who it is, and how scenarios and criteria load. */
export interface CompareDeps {
  decider?: typeof deciderJudge;
  resolved?: Pick<ResolvedDecider, "provider" | "model">;
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
export async function runDeciderCompare(
  argv: string[],
  deps: CompareDeps = {},
): Promise<void> {
  const args = parseArgs(argv);
  const asked = args.recorded
    ? undefined
    : (deps.resolved ?? resolveDecider(args.decider));
  const log = deps.log ?? ((text: string) => console.log(text));
  const { items, skipped } = await loadJudgedResults({
    ...deps.load,
    runIds: args.runIds,
    scenarioIds: args.scenarioIds.length > 0 ? args.scenarioIds : undefined,
    includeStale: args.includeStale,
    includeUnjudged: args.references.length > 0,
    llmVerdictOnly: args.references.length === 0 && !args.recorded,
    resultsDir: args.resultsDir,
  });
  const candidates = await withVotes(items, args);
  const selected =
    args.limit == null ? candidates : candidates.slice(0, args.limit);

  log(
    asked == null
      ? `Reading the recorded decider answer of ${selected.length} of ${candidates.length} saved result(s)...`
      : `Judging ${selected.length} of ${candidates.length} saved result(s) with the decider ${asked.provider}/${asked.model}...`,
  );

  const concurrency =
    args.concurrency ?? defaultConcurrency({ provider: asked?.provider });
  const compared = await mapConcurrent(selected, concurrency, (c) =>
    compareOne(c, asked, deps.decider ?? deciderJudge),
  );
  const entries = compared.filter((e) => e != null);

  if (entries.length < compared.length) {
    log(
      `${compared.length - entries.length} result(s) have no saved decider answer (not a --decider run) and are left out.`,
    );
  }

  const lines = [
    ...formatReport(entries, skipped),
    ...(args.references.length > 0
      ? ["", ...referenceLines(entries, args.references)]
      : []),
  ];

  log(`\n${lines.join("\n")}`);

  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const path = join(args.resultsDir, `decider-compare-${stamp}.json`);

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
 * Re-judge one saved result. A decider failure is recorded, not thrown.
 *
 * @param candidate - The saved result, its criteria and any sidecar votes
 * @param asked - The decider to call; undefined reads the answer saved in the result
 * @param decider - The decider judge
 * @returns The comparison entry, or undefined for a result with no saved decider answer
 */
async function compareOne(
  candidate: Candidate,
  asked: Pick<ResolvedDecider, "provider" | "model"> | undefined,
  decider: typeof deciderJudge,
): Promise<CompareEntry | undefined> {
  const { result, file, criteria } = candidate.item;
  const reference =
    candidate.votes.length > 0 ? resolveReference(candidate.votes) : undefined;
  const base = {
    file,
    scenarioId: result.scenarioId,
    judge: reference == null ? storedJudge(result) : voteJudge(reference.votes),
    reference,
    checksPass: result.checks.pass,
    ...(result.judge?.llm != null && { runLlmPass: result.judge.llm.pass }),
  };

  if (asked == null) {
    const saved = recordedDecider(result, criteria);

    return saved == null ? undefined : { ...base, ...saved };
  }

  try {
    const answer = await decider(
      { turns: result.turns, checks: judgeChecks(result) },
      criteria,
      { provider: asked.provider, model: asked.model },
    );

    return { ...base, decider: answer };
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
 * @throws On a bad `--decider` value, or `--decider` with `--recorded`
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

  const decider = flag("decider").at(-1);
  const recorded = argv.includes("--recorded");

  if (decider != null && recorded) {
    throw new Error(
      "--decider can't be used with --recorded: the run's saved answers are used",
    );
  }

  return {
    runIds: runIds.length > 0 ? runIds : undefined,
    scenarioIds: flag("scenario"),
    limit: num("limit"),
    concurrency: num("concurrency"),
    decider: decider == null ? undefined : parseDeciderSpec(decider),
    includeStale: argv.includes("--include-stale"),
    recorded,
    references: flag("reference").map((s) => judgeSlug(s)),
    resultsDir: flag("results-dir").at(-1) ?? RESULTS_DIR,
  };
}

if (import.meta.main) {
  await runDeciderCompare(process.argv.slice(2));
}
