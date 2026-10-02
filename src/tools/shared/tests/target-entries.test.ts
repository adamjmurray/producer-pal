// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";

describe("targetEntries", () => {
  it("splits a param with real entries, without a word", () => {
    const warn = vi.spyOn(console, "warn");

    expect(targetEntries("t0, t1", "id")).toStrictEqual(["t0", "t1"]);
    expect(warn).not.toHaveBeenCalled();
  });

  // A param already confirmed non-blank can still parse to nothing once every
  // entry trims away. It reads exactly like an omitted param, which is the
  // silent wrong-object these params exist to prevent.
  it("refuses a list where every entry is blank", () => {
    expect(() => targetEntries(",  ,", "id")).toThrow(
      'invalid id ",  ," - it names nothing',
    );
  });

  // An omitted param is nullish by the time it gets here, and there is nothing
  // to tell a caller about a param they never sent.
  it("takes an omitted param without a word", () => {
    const warn = vi.spyOn(console, "warn");

    expect(targetEntries(undefined, "id")).toStrictEqual([]);
    expect(targetEntries(null, "path")).toStrictEqual([]);
    expect(targetEntries("", "id")).toStrictEqual([]);
    expect(targetEntries("  ", "path")).toStrictEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  // The hole has two readings with different answers — a stray comma, or a lost
  // entry — and nothing in the call says which. Dropping it shifts every later
  // pairing; keeping it names nothing. So neither: refuse and let the caller say
  // what they meant.
  it("refuses a hole in the list", () => {
    expect(() => targetEntries("t0,,t1", "id")).toThrow(
      'invalid id "t0,,t1" - it has an empty entry.',
    );
  });

  // A leading empty shifts every entry, same as an interior one.
  it("refuses a leading empty entry", () => {
    expect(() => targetEntries(",t0", "id")).toThrow(
      'invalid id ",t0" - it has an empty entry.',
    );
  });

  // The commonest typo in a hand-written list, and it moves nothing: there is
  // no later entry to shift. Read the way most languages read a list literal.
  it("takes one trailing comma without a word", () => {
    const warn = vi.spyOn(console, "warn");

    expect(targetEntries("t0,t1, ", "id")).toStrictEqual(["t0", "t1"]);
    expect(warn).not.toHaveBeenCalled();
  });

  // One is a typo; two is a hole in front of a typo.
  it("refuses a second trailing comma", () => {
    expect(() => targetEntries("t0,t1,,", "id")).toThrow(
      'invalid id "t0,t1,," - it has an empty entry.',
    );
  });
});
