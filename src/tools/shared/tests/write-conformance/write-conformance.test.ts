// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Every write tool, run through the same cases from dev/PRINCIPLES.md:
//
//  1. N targets give N entries, in the order named; a lone one is unwrapped.
//  2. A target named twice: the last wins, each earlier mention is skipped
//     unwritten, with a `detail` saying so and no `ok`. Creating new objects
//     twice is two targets, not a repeat.
//  3. A later target that fully replaces an earlier one (same slot, same
//     arrangement spot): the earlier is skipped unwritten, with a `detail`
//     "overwritten later in this call by <later>", and no `ok` or `deleted`.
//  4. One bad entry among good ones: one that can't be parsed refuses the whole
//     call before any write; one that parses but can't be applied is skipped
//     (`ok: false` and a `detail`) while the rest write.
//  5. Live throws partway: that target gets an `ok: false` entry, earlier ones
//     keep theirs, later ones still run. A throw after the target already
//     changed Live keeps the target's normal entry, plus a `detail` saying what
//     landed (`ok: false` is only for a target nothing of which landed).
//  6. A list of the wrong length is refused up front, nothing written.
//  7. Any up-front refusal leaves nothing written.
//  8. `count` with a list of destinations is refused up front.
//  9. A lone target that is skipped makes the call throw with its detail.
//
// A tool that fails a case today is listed under `skip` in its adapter, with
// what it does instead. Those skips are the to-do list for moving every write
// tool onto one shared pipeline. A skipped case still runs and has to keep
// failing, so a tool that gets fixed turns its case red until the skip is
// dropped.

import { describe, expect, it } from "vitest";
import { ADAPTERS } from "./write-conformance-adapters.ts";
import { expectCase } from "./write-conformance-cases.ts";
import {
  CASE_IDS,
  type CaseId,
  type WriteToolAdapter,
} from "./write-conformance-types.ts";

describe.each(ADAPTERS)("write conformance: $tool", (adapter) => {
  it("accounts for every case exactly once", () => {
    // A case that applies, or is skipped, has a hook to run; one that doesn't
    // apply has none of its own; none is both n/a and skipped.
    const problems = CASE_IDS.flatMap((id) => {
      const notApplicable = adapter.na?.[id] != null;

      return [
        notApplicable && adapter.skip?.[id] != null
          ? `${id} is both n/a and skipped`
          : null,
        hasOwnHook(adapter, id) === notApplicable
          ? `${id} ${notApplicable ? "is n/a but has a hook" : "has no hook"}`
          : null,
      ].filter((problem) => problem != null);
    });

    expect(problems).toStrictEqual([]);
  });

  for (const id of CASE_IDS) {
    it.skipIf(adapter.na?.[id] != null)(
      `${id}${noteFor(adapter, id)}`,
      async () => {
        await expectCase(adapter, id);
      },
    );
  }
});

/**
 * What a case's title says about why it doesn't pass.
 * @param adapter - The tool
 * @param id - The case
 * @returns " — n/a: ...", " — skipped (fails today): ...", or nothing
 */
function noteFor(adapter: WriteToolAdapter, id: CaseId): string {
  const notApplicable = adapter.na?.[id];
  const skipped = adapter.skip?.[id];

  if (notApplicable != null) {
    return ` — n/a: ${notApplicable}`;
  }

  return skipped == null ? "" : ` — skipped (fails today): ${skipped}`;
}

/**
 * Whether an adapter supplies a hook for a case. Order and lone share one, so
 * a case that doesn't apply still sees it while its twin does.
 * @param adapter - The tool
 * @param id - The case
 * @returns true if the case has a hook it runs on its own account
 */
function hasOwnHook(adapter: WriteToolAdapter, id: CaseId): boolean {
  const hooks = {
    order: adapter.many,
    lone: adapter.many,
    namedTwice: adapter.repeat,
    newTwice: adapter.newTwice,
    replacedLater: adapter.replacedLater,
    unparsable: adapter.unparsable,
    unappliable: adapter.unappliable,
    midway: adapter.midway,
    afterChange: adapter.afterChange,
    wrongLength: adapter.wrongLength,
    refusals: adapter.refusals,
    countWithDestinations: adapter.countWithDestinations,
    loneSkipped: adapter.loneSkipped,
  };
  const twin = id === "order" ? "lone" : "order";
  const twinApplies =
    (id === "order" || id === "lone") && adapter.na?.[twin] == null;

  return hooks[id] != null && !(adapter.na?.[id] != null && twinApplies);
}
