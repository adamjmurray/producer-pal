// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  targetEntries,
  namedIdParam,
  namedParam,
  namedPathParam,
  paramNamesSomething,
} from "#src/tools/shared/utils.ts";

describe("namedParam", () => {
  it("reads a blank param as naming nothing, without a word", () => {
    const warn = vi.spyOn(console, "warn");

    expect(namedParam(undefined, "path")).toBeUndefined();
    expect(namedParam(null, "path")).toBeUndefined();
    expect(namedParam("", "path")).toBeUndefined();
    expect(namedParam("   ", "path")).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  // A model writes the word instead of leaving the param out. Counting that as
  // sent refuses calls and pairs values with the wrong object, so read it as
  // unset — but say so, since it names nothing.
  it("reads a coerced null as naming nothing, and says so", () => {
    const warn = vi.spyOn(console, "warn");

    expect(namedParam("null", "toPath")).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('toPath "null" names nothing');

    expect(namedParam(" undefined ", "id")).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('id "undefined" names nothing');
  });

  // Only the whole value. "null" inside a list is an entry that has to fail.
  it("keeps a list whose entries include null", () => {
    expect(namedParam("t0/s0,null", "toPath")).toBe("t0/s0,null");
  });

  it("trims a param that names something", () => {
    expect(namedParam(" t7/s2 ", "path")).toBe("t7/s2");
  });
});

describe("namedIdParam", () => {
  it("reads the canonical id", () => {
    expect(namedIdParam(" 42 ", undefined, "clipId")).toBe("42");
  });

  it("falls back to the alias when id is unset", () => {
    expect(namedIdParam(undefined, " 42 ", "clipId")).toBe("42");
    expect(namedIdParam("", "42", "clipId")).toBe("42");
  });

  it("names nothing when neither is set", () => {
    expect(namedIdParam(undefined, undefined, "clipId")).toBeUndefined();
  });

  it("takes the two spellings of one id without a word", () => {
    const warn = vi.spyOn(console, "warn");

    expect(namedIdParam("42", " 42 ", "clipId")).toBe("42");
    expect(warn).not.toHaveBeenCalled();
  });

  // Honoring one and dropping the other in silence is how a call reads the
  // wrong object, so the dropped one gets named.
  it("keeps id and says the alias went nowhere when they disagree", () => {
    const warn = vi.spyOn(console, "warn");

    expect(namedIdParam("42", "99", "clipId")).toBe("42");
    expect(warn).toHaveBeenCalledWith(
      'clipId "99" ignored — "id" names the target',
    );
  });
});

describe("namedPathParam", () => {
  it("reads the canonical path", () => {
    expect(namedPathParam(" t0/s1 ", undefined)).toBe("t0/s1");
  });

  it("falls back to paths when path is unset", () => {
    expect(namedPathParam(undefined, " t0/s1,t2/s3 ")).toBe("t0/s1,t2/s3");
  });

  it("names nothing when neither is set", () => {
    expect(namedPathParam(undefined, undefined)).toBeUndefined();
  });

  it("keeps path and says paths went nowhere when they disagree", () => {
    const warn = vi.spyOn(console, "warn");

    expect(namedPathParam("t0/s1", "t9/s9")).toBe("t0/s1");
    expect(warn).toHaveBeenCalledWith(
      'paths "t9/s9" ignored — "path" names the target',
    );
  });
});

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

describe("paramNamesSomething", () => {
  it("reads nullish, blank, and coerced-null values as unset", () => {
    expect(paramNamesSomething(undefined)).toBe(false);
    expect(paramNamesSomething(null)).toBe(false);
    expect(paramNamesSomething("")).toBe(false);
    expect(paramNamesSomething("  ")).toBe(false);
    expect(paramNamesSomething("null")).toBe(false);
    expect(paramNamesSomething("undefined")).toBe(false);
  });

  it("reads any other value as named", () => {
    expect(paramNamesSomething("t0")).toBe(true);
    expect(paramNamesSomething(0)).toBe(true);
    expect(paramNamesSomething(false)).toBe(true);
  });
});
