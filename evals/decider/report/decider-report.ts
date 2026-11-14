// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Text report for a decider vs stored judge comparison.
 */

import {
  summarizeAgreement,
  summarizeOutcome,
  type OutcomeStats,
  type VerdictPair,
  type VerdictStats,
} from "./decider-agreement.ts";
import { bandLines, claimsLines } from "./decider-bands.ts";
import { type DeciderJudgeResult } from "../decider-judge.ts";
import { type ReferenceVerdict } from "../sidecar-judges/decider-reference.ts";
import { DECIDER_PROVIDERS } from "../decider-provider.ts";
import { type SkipCounts } from "../decider-results.ts";

/** Jev input price, USD per million tokens. */
export const JEV_USD_PER_M_INPUT_TOKENS = 0.042;

/** How many results the "Lowest outcome scores" section lists. */
const LOWEST_OUTCOME_COUNT = 10;

/** One compared result. `decider` is missing when the decider call failed. */
export interface CompareEntry {
  file: string;
  scenarioId: string;
  /** The verdict stored in the saved result */
  judge: {
    pass: boolean;
    issues: string[];
    advisory?: boolean;
    provider?: string;
    model?: string;
  };
  /** The LLM judge's verdict in a `--decider` run, when it ran (after an escalation) */
  runLlmPass?: boolean;
  /** The deterministic checks passed, so the judge decides the outcome */
  checksPass: boolean;
  /** Set when the reference is the sidecar LLM judges, not the stored judge.
   *  `judge.pass` is then their majority; a tie has no majority and is left
   *  out of the stats. */
  reference?: ReferenceVerdict;
  decider?: DeciderJudgeResult;
  /** Why the decider call failed */
  error?: string;
}

/**
 * Build the report lines: counts, verdict stats, wrong calls, the lowest
 * outcome scores among judge passes, and cost.
 *
 * @param entries - Compared results
 * @param skipped - What the loader left out
 * @returns Report lines
 */
export function formatReport(
  entries: CompareEntry[],
  skipped: SkipCounts,
): string[] {
  const errors = entries.filter((e) => e.decider == null);
  const answered = entries.filter((e) => e.decider != null);
  const judged = answered.filter(hasReference);
  const ties = answered.length - judged.length;
  const sidecars = entries.some((e) => e.reference != null);
  const tieNote =
    ties > 0 ? "; " + ties + " tied (no majority, not counted)" : "";

  return [
    sidecars ? "Decider vs LLM judges" : "Decider vs stored judge",
    `${sidecars ? "Reference" : "Stored judge"}: ${judgeCounts(judged)}`,
    `Decider: ${deciderCounts(judged)}`,
    `Compared ${judged.length} result(s); ${errors.length} decider error(s)${tieNote}.`,
    `Left out: ${skipped.notScored} skipped/error, ${skipped.noScenario} unknown scenario, ${skipped.noLlmJudge} scenario without llm_judge, ${skipped.unreadable} unreadable, ${skipped.staleCriteria} recorded before the criteria changed${deciderNote(skipped)}.`,
    "",
    ...statsLines(
      "Checks passed (the judge decides)",
      judged.filter((e) => e.checksPass),
    ),
    "",
    ...statsLines("All results", judged),
    "",
    `Truncated transcripts: ${judged.filter((e) => e.decider?.truncated).length}`,
    "",
    ...wrongCallLines(judged),
    "",
    ...claimsLines(judged),
    "",
    ...bandLines(judged),
    "",
    ...lowestOutcomeLines(judged),
    ...errorLines(errors),
    "",
    costLine(judged),
  ];
}

/**
 * Say why decider-decided results are missing from a stored-judge comparison.
 *
 * @param skipped - What the loader left out
 * @returns A report fragment, or "" when nothing was left out for this reason
 */
function deciderNote(skipped: SkipCounts): string {
  return skipped.deciderDecided > 0
    ? `, ${skipped.deciderDecided} decided by the decider in the run (no LLM verdict to compare; the compared results include the ones the decider escalated, which are the hard cases)`
    : "";
}

/**
 * Format the verdict stats for one subset.
 *
 * @param title - Block heading
 * @param subset - Entries with a decider answer
 * @returns Report lines
 */
export function statsLines(title: string, subset: CompareEntry[]): string[] {
  const s: VerdictStats = summarizeAgreement(subset.map(toPair));
  const o = summarizeOutcome(
    subset.flatMap((e) =>
      e.decider == null
        ? []
        : [
            {
              judgePass: e.judge.pass,
              score: e.decider.outcome.score,
              maxScore: e.decider.outcome.maxScore,
            },
          ],
    ),
  );

  return [
    `${title}: n=${s.n}, judge fails ${s.judgeFails}`,
    `  decider pass ${s.deciderPass}, fail ${s.deciderFail}, escalate ${s.escalate} (${pct(s.escalatePct)})`,
    `  Wrong pass ${s.wrongPass}, wrong fail ${s.wrongFail}; agreement on non-escalated ${pct(s.agreePct)}`,
    outcomeLine(o),
  ];
}

/**
 * Does the entry have a verdict to compare the decider against? Only a tie among the
 * LLM judges has none.
 *
 * @param entry - A compared result
 * @returns False for a tie
 */
function hasReference(entry: CompareEntry): boolean {
  return entry.reference == null || entry.reference.majority != null;
}

/**
 * Format the outcome score stats for one subset.
 *
 * @param o - Outcome stats
 * @returns One report line
 */
function outcomeLine(o: OutcomeStats): string {
  const auc = o.auc == null ? "n/a" : o.auc.toFixed(3);

  const scale =
    o.maxScore != null
      ? `0-${o.maxScore}`
      : o.passN + o.failN === 0
        ? "none"
        : "share of each scale, 0-1";

  return `  Outcome score (${scale}), mean: judge pass ${fixed(o.passMean)} (n=${o.passN}), judge fail ${fixed(o.failMean)} (n=${o.failN}); AUC ${auc}`;
}

/**
 * Pair the stored judge and the decider verdicts for one entry.
 *
 * @param entry - A compared result with a decider answer
 * @returns The verdict pair
 */
function toPair(entry: CompareEntry): VerdictPair {
  return {
    judgePass: entry.judge.pass,
    decider: entry.decider?.verdict ?? "escalate",
  };
}

/**
 * List the wrong passes and wrong fails (escalations are not listed).
 *
 * @param judged - Entries with a decider answer
 * @returns Report lines
 */
function wrongCallLines(judged: CompareEntry[]): string[] {
  const lines = ["Wrong calls:"];
  let count = 0;

  for (const e of judged) {
    const decider = e.decider;
    const wrong =
      (decider?.verdict === "pass" && !e.judge.pass) ||
      (decider?.verdict === "fail" && e.judge.pass);

    if (decider == null || !wrong) {
      continue;
    }

    count++;
    const issues =
      e.judge.issues.length > 0 ? ` - ${e.judge.issues.join(" | ")}` : "";
    const probs = decider.questions
      .map((q) => `${q.id}=${q.probability.toFixed(2)}`)
      .join(" ");
    const kind = decider.verdict === "pass" ? "wrong pass" : "wrong fail";

    lines.push(
      `- ${e.file} (${kind})`,
      `  scenario ${e.scenarioId}; checks ${e.checksPass ? "passed" : "failed"}`,
      `  Judge (${judgeName(e)}): ${e.judge.pass ? "pass" : "fail"}${issues}`,
      `  decider: ${decider.verdict} - ${probs} outcome=${outcomeText(decider.outcome)}`,
    );
  }

  return count === 0 ? [...lines, "  (none)"] : lines;
}

/**
 * List the results with the lowest outcome score among those the stored judge
 * passed: candidates the judge may have missed.
 *
 * @param judged - Entries with a decider answer
 * @returns Report lines
 */
function lowestOutcomeLines(judged: CompareEntry[]): string[] {
  const lowest = judged
    .filter((e) => e.judge.pass && e.decider != null)
    .toSorted(
      (a, b) =>
        outcomeFraction(a.decider?.outcome) -
        outcomeFraction(b.decider?.outcome),
    )
    .slice(0, LOWEST_OUTCOME_COUNT);
  const lines = ["Lowest outcome scores (judge passed):"];

  for (const e of lowest) {
    const decider = e.decider;

    if (decider != null) {
      lines.push(
        `- ${e.file}: scenario ${e.scenarioId}; outcome=${outcomeText(decider.outcome)}; decider ${decider.verdict}`,
      );
    }
  }

  return lowest.length === 0 ? [...lines, "  (none)"] : lines;
}

/**
 * List results where the decider call failed.
 *
 * @param errors - Entries without a decider answer
 * @returns Report lines (empty when there are no errors)
 */
function errorLines(errors: CompareEntry[]): string[] {
  if (errors.length === 0) {
    return [];
  }

  return [
    "",
    "Decider errors:",
    ...errors.map((e) => `- ${e.file}: ${e.error ?? "unknown error"}`),
  ];
}

/**
 * Summarize tokens used and what they cost: the actual cost when every
 * answer carried one, otherwise an estimate from the TypeSafe price.
 *
 * @param judged - Entries with a decider answer
 * @returns One report line
 */
function costLine(judged: CompareEntry[]): string {
  const tokens = judged.reduce(
    (sum, e) => sum + (e.decider?.inputTokens ?? 0),
    0,
  );
  const costs = judged.map((e) => e.decider?.cost);

  if (judged.length > 0 && costs.every((c) => c != null)) {
    const actual = costs.reduce((sum, c) => sum + c, 0);

    return `Decider input tokens: ${tokens} (actual $${actual.toFixed(4)})`;
  }

  // The price is Jev's, so only hosted calls get an estimate; local ones are free.
  const hosted = judged.filter(
    (e) =>
      e.decider != null && DECIDER_PROVIDERS[e.decider.provider].envVar != null,
  );

  if (hosted.length === 0) {
    return `Decider input tokens: ${tokens} (local, no cost)`;
  }

  const hostedTokens = hosted.reduce(
    (sum, e) => sum + (e.decider?.inputTokens ?? 0),
    0,
  );
  const usd = (hostedTokens / 1_000_000) * JEV_USD_PER_M_INPUT_TOKENS;
  const local = hosted.length < judged.length ? ", local calls free" : "";

  return `Decider input tokens: ${tokens} (~$${usd.toFixed(4)} estimated${local})`;
}

/**
 * Format a number to two decimals.
 *
 * @param value - A number, or null
 * @returns Text like "2.33" or "n/a"
 */
export function fixed(value: number | null): string {
  return value == null ? "n/a" : value.toFixed(2);
}

/**
 * Format a percentage.
 *
 * @param value - 0-100, or null
 * @returns Text like "87.5%" or "n/a"
 */
export function pct(value: number | null): string {
  return value == null ? "n/a" : `${value.toFixed(1)}%`;
}

/**
 * Name the judge that gave an entry's stored verdict.
 *
 * @param entry - A compared result
 * @returns "provider/model", or "unknown" for results saved without it
 */
function judgeName(entry: CompareEntry): string {
  const { provider, model } = entry.judge;

  if (provider == null) {
    return "unknown";
  }

  return model == null ? provider : `${provider}/${model}`;
}

/**
 * Count the compared results per stored judge, most common first.
 *
 * @param entries - Compared results
 * @returns Text like "codex-code/luna (372), unknown (20)"
 */
function judgeCounts(entries: CompareEntry[]): string {
  const counts = new Map<string, number>();

  for (const e of entries) {
    counts.set(judgeName(e), (counts.get(judgeName(e)) ?? 0) + 1);
  }

  return countsText(counts);
}

/**
 * @param counts - How many results each name has
 * @returns Text like "a (3), b (1)", most common first, or "none"
 */
function countsText(counts: Map<string, number>): string {
  const sorted = [...counts].toSorted((a, b) => b[1] - a[1]);

  return sorted.map(([name, n]) => `${name} (${n})`).join(", ") || "none";
}

/**
 * Count the answers per decider (provider and resolved model), most common
 * first, so results from different deciders show up as such.
 *
 * @param entries - Compared results with a decider answer
 * @returns Text like "typesafe/jev-1.14.0 (50)"
 */
function deciderCounts(entries: CompareEntry[]): string {
  const counts = new Map<string, number>();

  for (const e of entries) {
    const name = e.decider == null ? "unknown" : deciderName(e.decider);

    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return countsText(counts);
}

/**
 * Name a decider as provider/model.
 *
 * @param answer - A decider answer
 * @returns Text like "ollama/autotrust-jev"
 */
export function deciderName(
  answer: Pick<DeciderJudgeResult, "provider" | "model">,
): string {
  return `${answer.provider}/${answer.model}`;
}

/**
 * Show an outcome as score out of the top of its scale, with its level name.
 *
 * @param outcome - A decider outcome
 * @returns Text like "4.0/5 near-complete success"
 */
function outcomeText(outcome: DeciderJudgeResult["outcome"]): string {
  return `${outcome.score.toFixed(1)}/${outcome.maxScore} ${outcome.label}`;
}

/**
 * An outcome as a share of its own scale, so scores on different scales sort together.
 *
 * @param outcome - A decider outcome, if any
 * @returns 0 to 1 (0 with no outcome)
 */
function outcomeFraction(
  outcome: DeciderJudgeResult["outcome"] | undefined,
): number {
  return outcome == null ? 0 : outcome.score / outcome.maxScore;
}
