import { describe, expect, it } from "vitest";
import {
  parseArrangementStartList,
  parseSceneIndexList,
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
