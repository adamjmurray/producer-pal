// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  parseArrangementStartList,
  parseSceneIndexList,
  parseSlotList,
} from "./position-parsing.ts";

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
    expect(parseSlotList("0/1")).toStrictEqual([
      { trackIndex: 0, sceneIndex: 1 },
    ]);
  });

  it("should parse multiple comma-separated slots", () => {
    expect(parseSlotList("0/1, 2/3")).toStrictEqual([
      { trackIndex: 0, sceneIndex: 1 },
      { trackIndex: 2, sceneIndex: 3 },
    ]);
  });

  it("should handle whitespace around slots", () => {
    expect(parseSlotList(" 1/2 , 3/4 ")).toStrictEqual([
      { trackIndex: 1, sceneIndex: 2 },
      { trackIndex: 3, sceneIndex: 4 },
    ]);
  });

  it("should return empty array for null input", () => {
    expect(parseSlotList(null)).toStrictEqual([]);
  });

  it("should throw for missing separator", () => {
    expect(() => parseSlotList("01")).toThrow(
      'invalid toSlot "01" - expected trackIndex/sceneIndex format',
    );
  });

  it("should warn and use first two parts when extra separators present", () => {
    const result = parseSlotList("0/1/2");

    expect(result).toStrictEqual([{ trackIndex: 0, sceneIndex: 1 }]);
    expect(outlet).toHaveBeenCalledWith(
      1,
      'toSlot "0/1/2" has extra parts, using first two (trackIndex/sceneIndex)',
    );
  });

  it("should throw for non-integer values", () => {
    expect(() => parseSlotList("a/b")).toThrow(
      'invalid toSlot "a/b" - trackIndex and sceneIndex must be integers',
    );
  });

  it("should throw for negative trackIndex", () => {
    expect(() => parseSlotList("-1/0")).toThrow(
      'invalid toSlot "-1/0" - trackIndex and sceneIndex must be non-negative',
    );
  });

  it("should throw for negative sceneIndex", () => {
    expect(() => parseSlotList("0/-1")).toThrow(
      'invalid toSlot "0/-1" - trackIndex and sceneIndex must be non-negative',
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
