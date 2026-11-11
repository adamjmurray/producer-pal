// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Report lines for a comparison whose reference is several sidecar LLM judges:
 * pairwise agreement, each judge's errors against the others, and the results
 * where the LLM judges split.
 */

import {
  errorsVsOthers,
  pairwiseAgreement,
  type Calls,
} from "./decider-reference.ts";
import { statsLines, type CompareEntry } from "../report/decider-report.ts";

const DECIDER_ID = "decider";

/** The split list is cut here; the JSON report has all of them. */
const SPLIT_LIST_LIMIT = 40;

/**
 * Build the extra report lines for sidecar references.
 *
 * @param entries - Compared results (those without a decider answer are ignored)
 * @param llmIds - The sidecar judge slugs used as the reference
 * @returns Report lines
 */
export function referenceLines(
  entries: CompareEntry[],
  llmIds: string[],
): string[] {
  const answered = entries.filter((e) => e.decider != null);
  const rows = answered.map(toCalls);
  const ids = [...llmIds, DECIDER_ID];
  const escalated = answered.filter((e) => e.decider?.verdict === "escalate");
  const unanimous = answered.filter(
    (e) => e.reference?.unanimous === true && e.checksPass,
  );

  return [
    `LLM judges: ${llmIds.join(", ")}`,
    "",
    "Pairwise agreement (both made a call; the decider escalations left out):",
    ...pairwiseAgreement(rows, ids).map(
      (p) => `  ${p.a} vs ${p.b}: ${percent(p.pct)} (${p.agree}/${p.n})`,
    ),
    "",
    "Wrong calls against the other LLM judges, where they all agree:",
    ...errorsVsOthers(rows, ids, llmIds).map(
      (e) =>
        `  ${e.judge}: n=${e.n}, wrong pass ${e.wrongPass}, wrong fail ${e.wrongFail}`,
    ),
    "",
    `The decider escalated on ${escalated.length} of ${answered.length} result(s).`,
    "",
    ...escalatedLines(escalated, llmIds),
    "",
    ...statsLines("Checks passed, LLM judges unanimous", unanimous),
    "",
    ...splitLines(answered),
  ];
}

/**
 * How the LLM judges do on the results the decider escalated, which is where a `--jev`
 * run relies on one of them.
 *
 * @param escalated - Entries the decider escalated
 * @param llmIds - The sidecar judge slugs
 * @returns Report lines
 */
function escalatedLines(escalated: CompareEntry[], llmIds: string[]): string[] {
  const rows = escalated.map(toCalls);

  return [
    `On the ${escalated.length} escalated result(s), pairwise agreement:`,
    ...pairwiseAgreement(rows, llmIds).map(
      (p) => `  ${p.a} vs ${p.b}: ${percent(p.pct)} (${p.agree}/${p.n})`,
    ),
    "  each judge against the others, where they all agree:",
    ...errorsVsOthers(rows, llmIds, llmIds).map(
      (e) =>
        `    ${e.judge}: n=${e.n}, wrong pass ${e.wrongPass}, wrong fail ${e.wrongFail}`,
    ),
  ];
}

/**
 * Format a percentage.
 *
 * @param value - 0-100, or null
 * @returns Text like "87.5%" or "n/a"
 */
function percent(value: number | null): string {
  return value == null ? "n/a" : value.toFixed(1) + "%";
}

/**
 * One result's calls by judge.
 *
 * @param entry - A compared result with a decider answer
 * @returns Each LLM judge's pass/fail, and the decider's unless it escalated
 */
function toCalls(entry: CompareEntry): Calls {
  const calls: Calls = {};

  for (const v of entry.reference?.votes ?? []) {
    calls[v.slug] = v.pass;
  }

  const verdict = entry.decider?.verdict;

  calls[DECIDER_ID] = verdict === "escalate" ? undefined : verdict === "pass";

  return calls;
}

/**
 * List results where the LLM judges disagree, for hand-labeling.
 *
 * @param answered - Entries with a decider answer
 * @returns Report lines
 */
function splitLines(answered: CompareEntry[]): string[] {
  const split = answered.filter((e) => e.reference?.unanimous === false);
  const lines = [
    `Split results (LLM judges disagree; hand-label these): ${split.length}`,
  ];

  for (const e of split.slice(0, SPLIT_LIST_LIMIT)) {
    const votes = (e.reference?.votes ?? [])
      .map((v) => `${v.slug}=${v.pass ? "pass" : "fail"}`)
      .join(" ");
    const issues = (e.reference?.votes ?? [])
      .filter((v) => !v.pass && v.issues.length > 0)
      .map((v) => `    ${v.slug}: ${v.issues.join(" | ")}`);

    lines.push(
      `- ${e.file} (${e.scenarioId}): ${votes} decider=${e.decider?.verdict ?? "none"}`,
      ...issues,
    );
  }

  if (split.length > SPLIT_LIST_LIMIT) {
    lines.push(
      `  ... ${split.length - SPLIT_LIST_LIMIT} more in the JSON report`,
    );
  }

  return lines;
}
