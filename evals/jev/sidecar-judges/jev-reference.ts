// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Math for using several sidecar LLM judges as the reference: their majority,
 * how often each pair agrees, and each judge's errors against the others.
 */

/** One sidecar judge's verdict on one result. */
export interface Vote {
  slug: string;
  pass: boolean;
  issues: string[];
}

/** What the LLM judges said about one result. */
export interface ReferenceVerdict {
  votes: Vote[];
  /** The strict majority; undefined on a tie */
  majority?: boolean;
  /** Every vote is the same */
  unanimous: boolean;
}

/** A judge's call on one result: undefined when it made none (escalated). */
export type Calls = Record<string, boolean | undefined>;

export interface PairAgreement {
  a: string;
  b: string;
  /** Results where both judges made a call */
  n: number;
  agree: number;
  /** 0-100, or null with no shared results */
  pct: number | null;
}

export interface ErrorsVsOthers {
  judge: string;
  /** Results where the judge made a call and the other LLM judges all agreed */
  n: number;
  /** The judge passed what the others failed */
  wrongPass: number;
  /** The judge failed what the others passed */
  wrongFail: number;
}

/**
 * Combine the LLM judges' votes on one result.
 *
 * @param votes - One vote per judge that judged it
 * @returns The majority (none on a tie) and whether the votes were unanimous
 */
export function resolveReference(votes: Vote[]): ReferenceVerdict {
  const passes = votes.filter((v) => v.pass).length;
  const fails = votes.length - passes;

  return {
    votes,
    majority: passes === fails ? undefined : passes > fails,
    unanimous: passes === 0 || fails === 0,
  };
}

/**
 * Agreement for every pair of judges.
 *
 * @param rows - One set of calls per result
 * @param ids - The judges to pair up
 * @returns One entry per pair, in `ids` order
 */
export function pairwiseAgreement(
  rows: Calls[],
  ids: string[],
): PairAgreement[] {
  const out: PairAgreement[] = [];

  for (const [i, a] of ids.entries()) {
    for (const b of ids.slice(i + 1)) {
      const shared = rows.filter((r) => r[a] != null && r[b] != null);
      const agree = shared.filter((r) => r[a] === r[b]).length;

      out.push({
        a,
        b,
        n: shared.length,
        agree,
        pct: shared.length === 0 ? null : (agree / shared.length) * 100,
      });
    }
  }

  return out;
}

/**
 * Each judge's wrong passes and fails, taking the other LLM judges as right
 * on results where they all agree. Needs two other voters when there are that
 * many; a lone other judge is the reference by itself.
 *
 * @param rows - One set of calls per result
 * @param ids - The judges to score (LLM judges and anything else, e.g. Jev)
 * @param llmIds - The LLM judges that form the reference
 * @returns One entry per judge in `ids`
 */
export function errorsVsOthers(
  rows: Calls[],
  ids: string[],
  llmIds: string[],
): ErrorsVsOthers[] {
  return ids.map((judge) => {
    const others = llmIds.filter((id) => id !== judge);
    const needed = Math.min(2, others.length);
    const out: ErrorsVsOthers = { judge, n: 0, wrongPass: 0, wrongFail: 0 };

    for (const row of rows) {
      const call = row[judge];
      const said = others.flatMap((id) => (row[id] == null ? [] : [row[id]]));
      const agreed = said.length > 0 && said.every((v) => v === said[0]);

      if (call == null || said.length < needed || !agreed) {
        continue;
      }

      out.n++;
      out.wrongPass += call && !said[0] ? 1 : 0;
      out.wrongFail += !call && said[0] ? 1 : 0;
    }

    return out;
  });
}
