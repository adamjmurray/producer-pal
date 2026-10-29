// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Picks which saved results an offline re-judge covers: gating checks passed,
 * then optionally every fail plus a seeded random sample of passes.
 */

import { type JudgedResult } from "../jev-results.ts";

/** How many passes to add to the fails; the seed makes the pick repeatable. */
export interface SampleSpec {
  passes: number;
  seed: number;
}

/**
 * Parse `--sample=fails+N`.
 *
 * @param text - The flag value
 * @returns The number of passes to sample
 * @throws On any other shape
 */
export function parseSample(text: string): number {
  const match = /^fails\+(\d+)$/.exec(text);

  if (match == null) {
    throw new Error(
      `Bad --sample=${text}; use fails+N, e.g. --sample=fails+20`,
    );
  }

  return Number(match[1]);
}

/**
 * Keep the results the judge decides: gating checks passed, unless asked for
 * all.
 *
 * @param items - Loaded results
 * @param includeFailedChecks - Keep results whose gating checks failed too
 * @returns The eligible results
 */
export function selectEligible(
  items: JudgedResult[],
  includeFailedChecks: boolean,
): JudgedResult[] {
  return includeFailedChecks
    ? items
    : items.filter((i) => i.result.checks.pass);
}

/**
 * Keep every fail and a seeded random sample of the passes. A fail is a result
 * the stored outcome marks as fail, or one in `failedFiles`.
 *
 * @param items - Eligible results
 * @param spec - How many passes, and the seed
 * @param failedFiles - Result files other judges failed
 * @returns The sample, in input order
 */
export function sampleResults(
  items: JudgedResult[],
  spec: SampleSpec,
  failedFiles: ReadonlySet<string> = new Set(),
): JudgedResult[] {
  const isFail = (i: JudgedResult): boolean =>
    i.result.result === "fail" || failedFiles.has(i.file);
  const passes = items
    .filter((i) => !isFail(i))
    .toSorted((a, b) => a.file.localeCompare(b.file));
  const picked = new Set(
    seededShuffle(passes, spec.seed).slice(0, spec.passes),
  );

  return items.filter((i) => isFail(i) || picked.has(i));
}

/**
 * Shuffle a copy of a list with a seeded generator (Fisher-Yates).
 *
 * @param list - Items to shuffle
 * @param seed - Same seed and list give the same order
 * @returns The shuffled copy
 */
export function seededShuffle<T>(list: T[], seed: number): T[] {
  const out = [...list];
  const next = mulberry32(seed);

  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));

    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }

  return out;
}

/**
 * Small seeded random generator.
 *
 * @param seed - Any integer
 * @returns A function giving numbers in [0, 1)
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
