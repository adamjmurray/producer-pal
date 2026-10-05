// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  namedIdParam,
  namedParam,
  namedPathParam,
  paramNamesSomething,
} from "#src/tools/shared/helpers/param-presence.ts";

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

  it("refuses the two spellings of one id, even with the same value", () => {
    expect(() => namedIdParam("42", " 42 ", "clipId")).toThrow(
      "id names the target on its own - don't send clipId with it",
    );
  });

  // Honoring one and dropping the other in silence is how a call reads the
  // wrong object, so the pair is refused.
  it("refuses the alias when it disagrees with id", () => {
    expect(() => namedIdParam("42", "99", "clipId")).toThrow(
      "id names the target on its own - don't send clipId with it",
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

  it("refuses paths when it disagrees with path", () => {
    expect(() => namedPathParam("t0/s1", "t9/s9")).toThrow(
      "path names the target on its own - don't send paths with it",
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
