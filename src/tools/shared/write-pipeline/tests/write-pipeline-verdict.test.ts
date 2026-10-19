// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  beginWarningCapture,
  changedNothing,
  endWarningCapture,
  recordWriteRun,
  suspendWarningCapture,
  type WarningCapture,
} from "#src/shared/max/v8-warning-capture.ts";
import { markSetChanged } from "../set-changed.ts";
import { runWrite } from "../write-pipeline.ts";
import { newToyLog, toySpec, type ToyArgs } from "./toy-write-spec.ts";

/**
 * Run the toy tool in a fresh request and say whether it provably changed
 * nothing. A throw is swallowed: it is the verdict that is under test.
 * @param args - The call
 * @param change - Hooks to swap into the toy
 * @returns The request's verdict
 */
async function verdictOf(
  args: ToyArgs,
  change: Partial<ReturnType<typeof toySpec>> = {},
): Promise<boolean> {
  const capture = beginWarningCapture();

  try {
    await runWrite({ ...toySpec(newToyLog()), ...change }, args);
  } catch {
    // The verdict is what is under test.
  }

  return finished(capture);
}

/**
 * @param capture - The request's capture
 * @returns Whether the request provably changed nothing
 */
function finished(capture: WarningCapture): boolean {
  const unchanged = changedNothing(capture);

  endWarningCapture(capture);

  return unchanged;
}

describe("runWrite: did the call change anything", () => {
  it.each([
    ["a check refuses it", { ids: "a", refuse: true }],
    ["the lists don't match", { ids: "a,b", names: "x,y,z" }],
    ["every target is skipped", { ids: "a,b", skip: { a: "gone", b: "gone" } }],
    [
      "a lone target is skipped, which throws",
      { ids: "a", skip: { a: "gone" } },
    ],
    [
      "every write throws before landing",
      { ids: "a,b", failBefore: ["a", "b"] },
    ],
  ])("changed nothing when %s", async (_what, args) => {
    expect(await verdictOf(args)).toBe(true);
  });

  it.each([
    ["a target is written", { ids: "a" }],
    ["one of two is written", { ids: "a,b", skip: { a: "gone" } }],
    ["a write lands, then throws", { ids: "a", failAfter: ["a"] }],
    ["a slow write lands", { ids: "a", slow: ["a"] }],
  ])("may have changed something when %s", async (_what, args) => {
    expect(await verdictOf(args)).toBe(false);
  });

  it("may have changed something when the whole-call step landed a change", async () => {
    const before: ReturnType<typeof toySpec>["before"] = (_checked, call) => {
      call.landed("tempo");
    };

    expect(await verdictOf({ ids: "a", skip: { a: "gone" } }, { before })).toBe(
      false,
    );
  });

  it("may have changed something when the whole-call step throws unrecorded", async () => {
    const before = (): void => {
      throw new Error("start refused");
    };

    expect(await verdictOf({ ids: "a" }, { before })).toBe(false);
  });

  it("may have changed something when the final step throws with nothing written", async () => {
    const settle = (): void => {
      throw new Error("restart refused");
    };

    expect(
      await verdictOf(
        { ids: "a,b", skip: { a: "gone", b: "gone" } },
        { settle },
      ),
    ).toBe(false);
  });

  it("changed nothing when the plan refuses", async () => {
    const plan = (): never => {
      throw new Error("can't be ordered");
    };

    expect(await verdictOf({ ids: "a,b" }, { plan })).toBe(true);
  });

  it("may have changed something when a skipped write left something in the Set", async () => {
    const capture = beginWarningCapture();
    const spec = toySpec(newToyLog());

    const write: typeof spec.write = () => {
      markSetChanged();
      throw new Error("not moved; left an empty chain: c1");
    };

    const entries = await runWrite({ ...spec, write }, { ids: "a,b" });

    // The entries stay skips: only the verdict changes.
    expect(entries).toStrictEqual([
      { id: "a", ok: false, detail: "not moved; left an empty chain: c1" },
      { id: "b", ok: false, detail: "not moved; left an empty chain: c1" },
    ]);
    expect(finished(capture)).toBe(false);
  });

  it("changed nothing when an async check refuses", async () => {
    const check = async (): Promise<never> => {
      await Promise.resolve();
      throw new Error("refused later");
    };

    expect(await verdictOf({ ids: "a" }, { check })).toBe(true);
  });

  it("changed nothing when an async settle runs after only skips", async () => {
    const settle = async (): Promise<void> => {
      await suspendWarningCapture(Promise.resolve());
    };

    expect(
      await verdictOf(
        { ids: "a,b", skip: { a: "gone", b: "gone" } },
        { settle },
      ),
    ).toBe(true);
  });

  it.each([
    ["before", ["a,b", "c"]],
    ["after", ["c", "a,b"]],
  ])(
    "may have changed something when a run %s it did",
    async (_when, order) => {
      const capture = beginWarningCapture();

      for (const ids of order) {
        await runWrite(toySpec(newToyLog()), {
          ids,
          skip: ids === "c" ? {} : { a: "gone", b: "gone" },
        });
      }

      expect(finished(capture)).toBe(false);
    },
  );

  it("says nothing when no write ran", () => {
    const capture = beginWarningCapture();

    expect(finished(capture)).toBe(false);
  });

  it("counts a later change over an earlier no-op, in either order", () => {
    const noop = beginWarningCapture();

    recordWriteRun(true);
    recordWriteRun(false);
    recordWriteRun(true);
    expect(finished(noop)).toBe(false);

    const only = beginWarningCapture();

    recordWriteRun(true);
    recordWriteRun(true);
    expect(finished(only)).toBe(true);
  });
});
