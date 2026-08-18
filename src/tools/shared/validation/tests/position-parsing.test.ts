// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  parseArrangementStartList,
  parseSceneIndexList,
  parseSlot,
  parseSlotList,
} from "../position-parsing.ts";

describe("parseSceneIndexList", () => {
  it("should parse a single index", () => {
    const result = parseSceneIndexList("0");

    expect(result).toStrictEqual([0]);
  });

  it("should parse multiple comma-separated indices", () => {
    const result = parseSceneIndexList("0,2,5");

    expect(result).toStrictEqual([0, 2, 5]);
  });

  it("should handle whitespace around indices", () => {
    const result = parseSceneIndexList(" 1 , 3 , 7 ");

    expect(result).toStrictEqual([1, 3, 7]);
  });

  it("should throw error for negative index", () => {
    expect(() => parseSceneIndexList("-1")).toThrow(
      'invalid sceneIndex "-1" - must be a non-negative integer',
    );
  });

  it("should throw error for negative index in list", () => {
    expect(() => parseSceneIndexList("0,1,-2,3")).toThrow(
      'invalid sceneIndex "-2" - must be a non-negative integer',
    );
  });
});

describe("parseSlotList", () => {
  it("should parse a single slot", () => {
    expect(parseSlotList("0/1", "toSlot")).toStrictEqual([
      { trackIndex: 0, sceneIndex: 1 },
    ]);
  });

  it("should parse multiple comma-separated slots", () => {
    expect(parseSlotList("0/1, 2/3", "toSlot")).toStrictEqual([
      { trackIndex: 0, sceneIndex: 1 },
      { trackIndex: 2, sceneIndex: 3 },
    ]);
  });

  it("should handle whitespace around slots", () => {
    expect(parseSlotList(" 1/2 , 3/4 ", "toSlot")).toStrictEqual([
      { trackIndex: 1, sceneIndex: 2 },
      { trackIndex: 3, sceneIndex: 4 },
    ]);
  });

  it("should return empty array for null input", () => {
    expect(parseSlotList(null, "toSlot")).toStrictEqual([]);
  });

  it("should throw for missing separator", () => {
    expect(() => parseSlotList("01", "toSlot")).toThrow(
      'invalid toSlot "01" - expected trackIndex/sceneIndex format',
    );
  });

  it("should warn and use first two parts when extra separators present", () => {
    const result = parseSlotList("0/1/2", "toSlot");

    expect(result).toStrictEqual([{ trackIndex: 0, sceneIndex: 1 }]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      'toSlot "0/1/2" has extra parts, using first two (trackIndex/sceneIndex)',
    );
  });

  it("should not warn for a clean two-part slot", () => {
    parseSlotList("0/1", "toSlot");

    // Exactly two parts must not trigger the extra-parts warning.
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("has extra parts"),
    );
  });

  // Slots are positional, so a dropped entry moves every later one.
  it("should warn when it drops an empty entry", () => {
    expect(parseSlotList(",0/1", "toSlot")).toStrictEqual([
      { trackIndex: 0, sceneIndex: 1 },
    ]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      'toSlot ",0/1" has empty entries, which were dropped',
    );
  });

  // playback sends `slots` and create-clip sends `slot`; a message naming
  // toSlot tells the model to fix a param the tool doesn't have.
  it("should name the param the caller actually sent", () => {
    expect(() => parseSlotList("0", "slots")).toThrow(
      'invalid slots "0" - expected trackIndex/sceneIndex format (e.g., "0/1")',
    );

    parseSlotList(",0/1", "slot");
    parseSlotList("0/1/2", "slot");

    expect(outlet).toHaveBeenCalledWith(
      1,
      'slot ",0/1" has empty entries, which were dropped',
    );
    expect(outlet).toHaveBeenCalledWith(
      1,
      'slot "0/1/2" has extra parts, using first two (trackIndex/sceneIndex)',
    );
  });

  it("should not warn for a clean list or a blank param", () => {
    parseSlotList("0/1, 2/3", "toSlot");
    parseSlotList("", "toSlot");
    parseSlotList(undefined, "toSlot");

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("has empty entries"),
    );
  });

  it("should throw for non-integer values", () => {
    expect(() => parseSlotList("a/b", "toSlot")).toThrow(
      'invalid toSlot "a/b" - trackIndex and sceneIndex must be integers',
    );
  });

  it("should throw for negative trackIndex", () => {
    expect(() => parseSlotList("-1/0", "toSlot")).toThrow(
      'invalid toSlot "-1/0" - trackIndex and sceneIndex must be non-negative',
    );
  });

  it("should throw for negative sceneIndex", () => {
    expect(() => parseSlotList("0/-1", "toSlot")).toThrow(
      'invalid toSlot "0/-1" - trackIndex and sceneIndex must be non-negative',
    );
  });
});

describe("parseSlot", () => {
  it("should parse a valid slot string", () => {
    expect(parseSlot("0/3")).toStrictEqual({ trackIndex: 0, sceneIndex: 3 });
  });

  it("should throw for missing separator", () => {
    expect(() => parseSlot("03")).toThrow(
      'invalid slot "03" - expected trackIndex/sceneIndex',
    );
  });

  it("should throw for extra separators", () => {
    expect(() => parseSlot("0/1/2")).toThrow(
      'invalid slot "0/1/2" - expected trackIndex/sceneIndex',
    );
  });

  it("should throw for non-integer values", () => {
    expect(() => parseSlot("a/b")).toThrow(
      'invalid slot "a/b" - trackIndex and sceneIndex must be integers',
    );
  });

  it("should throw when only one part is non-integer", () => {
    // Each NaN check is independent (OR), so a single bad part must still throw
    // — "a/b" alone can't prove that (both parts are NaN).
    expect(() => parseSlot("5/x")).toThrow(
      'invalid slot "5/x" - trackIndex and sceneIndex must be integers',
    );
    expect(() => parseSlot("x/5")).toThrow(
      'invalid slot "x/5" - trackIndex and sceneIndex must be integers',
    );
  });

  it("should throw for negative values", () => {
    expect(() => parseSlot("-1/0")).toThrow(
      'invalid slot "-1/0" - trackIndex and sceneIndex must be non-negative',
    );
  });
});

describe("parseArrangementStartList", () => {
  it("should parse a single bar|beat position", () => {
    const result = parseArrangementStartList("1|1");

    expect(result).toStrictEqual(["1|1"]);
  });

  it("should parse multiple bar|beat positions", () => {
    const result = parseArrangementStartList("1|1,2|1,3|3");

    expect(result).toStrictEqual(["1|1", "2|1", "3|3"]);
  });

  it("should handle whitespace around positions", () => {
    const result = parseArrangementStartList(" 1|1 , 2|2 ");

    expect(result).toStrictEqual(["1|1", "2|2"]);
  });
});
