// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/max/v8-max-console.ts";
import { namedParam, paramNamesSomething } from "#src/tools/shared/utils.ts";

describe("namedParam", () => {
  it("reads a blank param as naming nothing, without a word", () => {
    const warn = vi.spyOn(console, "warn");

    expect(namedParam(undefined, "path")).toBeUndefined();
    expect(namedParam(null, "path")).toBeUndefined();
    expect(namedParam("", "path")).toBeUndefined();
    expect(namedParam("   ", "path")).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  // z.coerce.string() turns a JSON null into "null" before the handler sees it.
  // Counting that as sent refuses calls and pairs values with the wrong object,
  // so read it as unset — but say so, since the caller never typed it.
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
