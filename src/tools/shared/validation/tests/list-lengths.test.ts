// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  countListEntries,
  requireSameLength,
  validateListLengths,
} from "#src/tools/shared/validation/list-lengths.ts";

describe("validateListLengths", () => {
  it("takes lists that agree", () => {
    expect(() =>
      validateListLengths([
        { param: "id", value: "t0,t1,t2" },
        { param: "name", value: "A,B,C" },
        { param: "color", value: "#f00,#0f0,#00f" },
      ]),
    ).not.toThrow();
  });

  // One value covers every item, which is the whole point of broadcasting — it
  // can never disagree with a list.
  it("takes a single value beside any list", () => {
    expect(() =>
      validateListLengths([
        { param: "id", value: "t0,t1,t2" },
        { param: "name", value: "Bass" },
        { param: "color", value: null },
      ]),
    ).not.toThrow();
  });

  it("refuses two lists that disagree, naming both counts", () => {
    expect(() =>
      validateListLengths([
        { param: "id", value: "t0,t1,t2" },
        { param: "name", value: "A,B" },
      ]),
    ).toThrow("id names 3 entries but name names 2 entries.");
  });

  // The mismatch is reported against the first list in the call, so the same
  // call always names the same two params however many lists it carries.
  it("reports the first list against the one that disagrees", () => {
    expect(() =>
      validateListLengths([
        { param: "id", value: "t0,t1" },
        { param: "name", value: "A,B" },
        { param: "color", value: "#f00,#0f0,#00f" },
      ]),
    ).toThrow("id names 2 entries but color names 3 entries.");
  });

  // The trailing comma is dropped before the counts are compared, the same way
  // both splitters drop it — so it can neither cause nor hide a mismatch.
  it("does not count a trailing comma", () => {
    expect(() =>
      validateListLengths([
        { param: "id", value: "t0,t1" },
        { param: "name", value: "A,B," },
      ]),
    ).not.toThrow();

    expect(() =>
      validateListLengths([
        { param: "id", value: "t0,t1,t2" },
        { param: "name", value: "A,B," },
      ]),
    ).toThrow("id names 3 entries but name names 2 entries.");
  });

  // A hole is still an entry here. Rule 3 refuses it in a target list and a
  // value list reads it as "keep what you had", so either way the count stands.
  it("counts an empty entry", () => {
    expect(() =>
      validateListLengths([
        { param: "id", value: "t0,t1,t2" },
        { param: "name", value: "A,,C" },
      ]),
    ).not.toThrow();
  });

  it("takes a call with nothing to compare", () => {
    expect(() =>
      validateListLengths([
        { param: "id", value: "t0" },
        { param: "name", value: undefined },
      ]),
    ).not.toThrow();
  });

  // update-clip's id and path name different clips and add up, so its target
  // count arrives worked out rather than as a param to split.
  it("takes a count worked out elsewhere", () => {
    expect(() =>
      validateListLengths([
        { param: "id and path", count: 4 },
        { param: "name", value: "A,B,C" },
      ]),
    ).toThrow("id and path names 4 entries but name names 3 entries.");
  });
});

describe("requireSameLength", () => {
  it("takes counts that agree", () => {
    expect(() =>
      requireSameLength(
        { param: "toPath", count: 3 },
        { param: "arrangementStart", count: 3 },
      ),
    ).not.toThrow();
  });

  it("takes a single value on either side", () => {
    expect(() =>
      requireSameLength(
        { param: "toPath", count: 1 },
        { param: "arrangementStart", count: 3 },
      ),
    ).not.toThrow();

    expect(() =>
      requireSameLength(
        { param: "toPath", count: 3 },
        { param: "arrangementStart", count: 1 },
      ),
    ).not.toThrow();
  });

  it("refuses two lists that disagree", () => {
    expect(() =>
      requireSameLength(
        { param: "toPath", count: 2 },
        { param: "arrangementStart", count: 3 },
      ),
    ).toThrow("toPath names 2 entries but arrangementStart names 3 entries.");
  });
});

describe("countListEntries", () => {
  it("counts entries, dropping one trailing comma", () => {
    expect(countListEntries("a,b,c")).toBe(3);
    expect(countListEntries("a,b,")).toBe(2);
    expect(countListEntries("a")).toBe(1);
  });

  it("counts an unset or blank value as none", () => {
    expect(countListEntries(null)).toBe(0);
    expect(countListEntries(undefined)).toBe(0);
    expect(countListEntries("")).toBe(0);
    expect(countListEntries("  ")).toBe(0);
  });
});
