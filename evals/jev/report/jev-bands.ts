// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Report sections about where Jev is unsure: which requirements sit between
 * the fail and pass thresholds most often, and what the claims question did.
 */

import {
  CLAIMS_THRESHOLD,
  FAIL_THRESHOLD,
  PASS_THRESHOLD,
  type JevJudgeResult,
} from "../jev-judge.ts";

/** How many requirements the band section lists. */
const BAND_ROWS = 12;
const TEXT_WIDTH = 60;

/** The part of a compared result these sections read. */
interface BandEntry {
  file: string;
  scenarioId: string;
  /** The reference verdict */
  judge: { pass: boolean };
  /** The LLM judge's verdict in the run, when it ran */
  runLlmPass?: boolean;
  jev?: JevJudgeResult;
}

interface BandCount {
  scenarioId: string;
  id: string;
  text: string;
  /** Results where the requirement was asked */
  asked: number;
  /** Answers between the fail and pass thresholds */
  inBand: number;
  /** Escalated results where this was the lowest answer */
  deciding: number;
}

/**
 * Count, per requirement, how often Jev's answer fell in the escalation band.
 *
 * @param entries - Compared results with a Jev answer
 * @returns Report lines, most uncertain requirement first
 */
export function bandLines(entries: BandEntry[]): string[] {
  const counts = new Map<string, BandCount>();

  for (const e of entries) {
    for (const q of e.jev?.questions ?? []) {
      if (q.kind === "claims") {
        continue;
      }

      const key = `${e.scenarioId} ${q.id}`;
      const c = counts.get(key) ?? {
        scenarioId: e.scenarioId,
        id: q.id,
        text: q.text,
        asked: 0,
        inBand: 0,
        deciding: 0,
      };

      c.asked++;
      c.inBand +=
        q.probability >= FAIL_THRESHOLD && q.probability < PASS_THRESHOLD
          ? 1
          : 0;
      c.deciding +=
        e.jev?.verdict === "escalate" && q.probability === e.jev.minProbability
          ? 1
          : 0;
      counts.set(key, c);
    }
  }

  const top = [...counts.values()]
    .filter((c) => c.inBand > 0)
    .toSorted((a, b) => b.inBand - a.inBand)
    .slice(0, BAND_ROWS);
  const lines = [
    `Requirements most often between ${FAIL_THRESHOLD} and ${PASS_THRESHOLD} (in band / asked / lowest of an escalation):`,
  ];

  for (const c of top) {
    const text = c.text.replaceAll(/\s+/g, " ").slice(0, TEXT_WIDTH);

    lines.push(
      `  ${c.scenarioId} ${c.id}: ${c.inBand}/${c.asked}/${c.deciding}  ${text}`,
    );
  }

  return top.length === 0 ? [...lines, "  (none)"] : lines;
}

/**
 * Report what the claims question did: how many passes it turned into an
 * escalation, and whether the reference had failed them.
 *
 * @param entries - Compared results with a Jev answer
 * @returns Report lines (a note when the answers have no claims question)
 */
export function claimsLines(entries: BandEntry[]): string[] {
  const asked = entries.filter((e) =>
    e.jev?.questions.some((q) => q.kind === "claims"),
  );

  if (asked.length === 0) {
    return ["Claims question: not in these answers"];
  }

  const claims = (e: BandEntry): number =>
    e.jev?.questions.find((q) => q.kind === "claims")?.probability ?? 1;
  const turned = asked.filter(
    (e) =>
      e.jev != null &&
      e.jev.minProbability >= PASS_THRESHOLD &&
      claims(e) < CLAIMS_THRESHOLD,
  );
  const caught = turned.filter((e) => !e.judge.pass);

  return [
    `Claims question (turns a pass into an escalation below ${CLAIMS_THRESHOLD}): asked on ${asked.length}, below ${CLAIMS_THRESHOLD} on ${asked.filter((e) => claims(e) < CLAIMS_THRESHOLD).length}`,
    `  Would otherwise have passed: ${turned.length}; the reference failed ${caught.length} of them (wrong passes avoided), passed ${turned.length - caught.length} (extra escalations)`,
    ...turned.map(
      (e) =>
        `  ${e.file}: claims ${claims(e).toFixed(2)}; reference ${e.judge.pass ? "pass" : "fail"}; LLM judge in the run ${verdictWord(e.runLlmPass)}`,
    ),
  ];
}

/**
 * Word for an LLM judge verdict that may be missing.
 *
 * @param pass - The verdict, or undefined when the judge did not run
 * @returns "pass", "fail" or "n/a"
 */
function verdictWord(pass: boolean | undefined): string {
  if (pass == null) {
    return "n/a";
  }

  return pass ? "pass" : "fail";
}
