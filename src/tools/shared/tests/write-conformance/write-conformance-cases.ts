// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isDeepStrictEqual } from "node:util";
import { expect } from "vitest";
import {
  entriesOf,
  freshLive,
  runTool,
  writesMade,
} from "./write-conformance-support.ts";
import {
  type CaseId,
  type ToolArgs,
  type WriteToolAdapter,
} from "./write-conformance-types.ts";

/** The check behind each case id, run against one tool's adapter. */
export const writeConformanceCases: Record<
  CaseId,
  (adapter: WriteToolAdapter) => Promise<void>
> = {
  order: expectOrder,
  lone: expectLoneUnwrapped,
  namedTwice: expectNamedTwice,
  newTwice: expectNewTwiceIsTwoTargets,
  replacedLater: expectReplacedLater,
  unparsable: expectUnparsableRefused,
  unparsableDestination: expectUnparsableDestinationRefused,
  unappliable: expectUnappliableSkipped,
  midway: expectMidwayFailure,
  afterChange: expectFailureAfterChange,
  wrongLength: expectWrongLengthRefused,
  refusals: expectRefusalsWriteNothing,
  countWithDestinations: expectCountWithDestinationsRefused,
  loneSkipped: expectLoneSkipThrows,
};

/**
 * Run one case against one tool.
 * @param adapter - The tool
 * @param id - The case
 */
export async function expectCase(
  adapter: WriteToolAdapter,
  id: CaseId,
): Promise<void> {
  await writeConformanceCases[id](adapter);
}

/**
 * A hook the adapter has to supply for a case it doesn't list under `na`.
 * @param adapter - The tool
 * @param hook - Which hook
 * @returns The hook
 * @throws Error when the adapter has none
 */
function needs<K extends keyof WriteToolAdapter>(
  adapter: WriteToolAdapter,
  hook: K,
): NonNullable<WriteToolAdapter[K]> {
  const found = adapter[hook];

  if (found == null) {
    throw new Error(`${adapter.tool} has no "${hook}" hook`);
  }

  return found;
}

/**
 * Check a call is refused whole, before anything is written.
 * @param adapter - The tool
 * @param args - The call
 * @param message - Part of the message it is refused with, when it matters
 */
async function expectRefusal(
  adapter: WriteToolAdapter,
  args: ToolArgs,
  message?: string,
): Promise<void> {
  await expect(runTool(adapter, args)).rejects.toThrow(message);
  expect(writesMade()).toStrictEqual([]);
}

/**
 * Check each entry holds what a scenario says, and didn't fail: a subset match
 * alone would pass an `ok: false` skip that happens to carry the same id and
 * path. The entries named in `except` are left to the case.
 * @param entries - What the call returned
 * @param expected - What each should hold
 * @param except - Indexes to leave alone
 */
function expectEntries(
  entries: object[],
  expected: object[],
  except: number[] = [],
): void {
  expect(entries).toHaveLength(expected.length);

  for (const [index, entry] of entries.entries()) {
    if (!except.includes(index)) {
      expect(entry).toMatchObject(expected[index] as object);
      expect(entry).not.toHaveProperty("ok", false);
    }
  }
}

async function expectOrder(adapter: WriteToolAdapter): Promise<void> {
  const { args, expected } = needs(adapter, "many")(3);
  const result = await runTool(adapter, args);

  expect(Array.isArray(result)).toBe(true);
  expectEntries(entriesOf(result), expected);
}

async function expectLoneUnwrapped(adapter: WriteToolAdapter): Promise<void> {
  const { args, expected } = needs(adapter, "many")(1);
  const result = await runTool(adapter, args);

  expect(Array.isArray(result)).toBe(false);
  expect(result).toMatchObject(expected[0] as object);
  expect(result).not.toHaveProperty("ok", false);
}

async function expectNamedTwice(adapter: WriteToolAdapter): Promise<void> {
  const { args, keptArgs, skipped, expected } = needs(adapter, "repeat")();
  const entries = entriesOf(await runTool(adapter, args));
  const written = writesMade();

  expectEntries(entries, expected, skipped);

  // An earlier mention is skipped, not failed: a detail and no `ok`.
  for (const index of skipped) {
    expect(entries[index]).toMatchObject({
      detail: expect.stringMatching(/named again/),
    });
    expect(entries[index]).not.toHaveProperty("ok");
  }

  // And it writes nothing: the call writes what naming only the last would.
  freshLive();
  needs(adapter, "repeat")();
  await runTool(adapter, keptArgs);
  expect(written).toStrictEqual(writesMade());
}

async function expectNewTwiceIsTwoTargets(
  adapter: WriteToolAdapter,
): Promise<void> {
  const { args, expected } = needs(adapter, "newTwice")();
  const entries = entriesOf(await runTool(adapter, args));

  expectEntries(entries, expected);

  for (const entry of entries) {
    expect(entry.detail ?? "").not.toMatch(/named again/);
  }
}

async function expectReplacedLater(adapter: WriteToolAdapter): Promise<void> {
  const { args, keptArgs, expected, replaced, by } = needs(
    adapter,
    "replacedLater",
  )();
  const entries = entriesOf(await runTool(adapter, args));
  const written = writesMade();

  expectEntries(entries, expected, replaced);

  // The earlier target is skipped, not written and not deleted: a detail naming
  // the later one, and no `ok` or `deleted`.
  for (const [at, index] of replaced.entries()) {
    expect(entries[index]?.detail).toContain(
      `overwritten later in this call by ${by[at]}`,
    );
    expect(entries[index]).not.toHaveProperty("ok");
    expect(entries[index]).not.toHaveProperty("deleted");
  }

  // It writes nothing: the call writes what naming only the later would.
  freshLive();
  needs(adapter, "replacedLater")();
  await runTool(adapter, keptArgs);
  expect(written).toStrictEqual(writesMade());
}

async function expectUnparsableRefused(
  adapter: WriteToolAdapter,
): Promise<void> {
  await expectRefusal(adapter, needs(adapter, "unparsable")());
}

async function expectUnparsableDestinationRefused(
  adapter: WriteToolAdapter,
): Promise<void> {
  // The parse error itself, so a call refused for some other reason can't pass.
  await expectEachRefused(
    adapter,
    needs(adapter, "unparsableDestinations"),
    'invalid toPath "not-a-path"',
  );
}

async function expectUnappliableSkipped(
  adapter: WriteToolAdapter,
): Promise<void> {
  const { args, expected, badIndex, landed } = needs(adapter, "unappliable")();
  const entries = entriesOf(await runTool(adapter, args));

  expectEntries(entries, expected, [badIndex]);
  expect(entries[badIndex]).toMatchObject({
    ok: false,
    detail: expect.any(String),
  });

  // The other targets really wrote: each write listed is in the log, and one
  // listed twice is there twice.
  const rest = writesMade();

  for (const write of landed) {
    const at = rest.findIndex((made) =>
      Object.entries(write).every(([key, value]) =>
        isDeepStrictEqual(made[key as keyof typeof made], value),
      ),
    );

    expect(at, `no write like ${JSON.stringify(write)}`).toBeGreaterThan(-1);
    rest.splice(at, 1);
  }
}

async function expectMidwayFailure(adapter: WriteToolAdapter): Promise<void> {
  const { args, expected, failIndex, message } = needs(adapter, "midway")();
  const entries = entriesOf(await runTool(adapter, args));

  expectEntries(entries, expected, [failIndex]);
  expect(entries[failIndex]).toMatchObject({
    ok: false,
    detail: expect.stringContaining(message),
  });
}

async function expectFailureAfterChange(
  adapter: WriteToolAdapter,
): Promise<void> {
  const { args, expected, failIndex, message, changed, landed } = needs(
    adapter,
    "afterChange",
  )();
  const entries = entriesOf(await runTool(adapter, args));

  expectEntries(entries, expected, [failIndex]);
  // Something landed, so the target keeps its normal entry plus a detail:
  // `ok: false` is for a target nothing of which landed.
  expect(entries[failIndex]).toMatchObject(changed);
  expect(entries[failIndex]).not.toHaveProperty("ok");
  expect(entries[failIndex]?.detail).toContain(message);
  expect(entries[failIndex]?.detail).toContain(landed);
}

async function expectWrongLengthRefused(
  adapter: WriteToolAdapter,
): Promise<void> {
  await expectRefusal(adapter, needs(adapter, "wrongLength")());
}

async function expectRefusalsWriteNothing(
  adapter: WriteToolAdapter,
): Promise<void> {
  await expectEachRefused(adapter, needs(adapter, "refusals"));
}

/**
 * Check each call is refused whole, on a fresh Live of its own.
 * @param adapter - The tool
 * @param setUps - Each sets up its mocks and returns the call
 * @param message - Part of the message each is refused with, when it matters
 */
async function expectEachRefused(
  adapter: WriteToolAdapter,
  setUps: Array<() => ToolArgs>,
  message?: string,
): Promise<void> {
  for (const [index, setUp] of setUps.entries()) {
    if (index > 0) {
      freshLive();
    }

    await expectRefusal(adapter, setUp(), message);
  }
}

async function expectCountWithDestinationsRefused(
  adapter: WriteToolAdapter,
): Promise<void> {
  await expectRefusal(adapter, needs(adapter, "countWithDestinations")());
}

async function expectLoneSkipThrows(adapter: WriteToolAdapter): Promise<void> {
  const { args, detail } = needs(adapter, "loneSkipped")();

  await expect(runTool(adapter, args)).rejects.toThrow(detail);
}
