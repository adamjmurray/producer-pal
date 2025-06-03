// src/utils.test.js
import { describe, expect, it } from "vitest";
import {
  setAllNonNull,
  withoutNulls,
  parseCommaSeparatedIds,
  parseCommaSeparatedIndices,
  parseTimeSignature,
  toLiveApiView,
  fromLiveApiView,
} from "./utils";

describe("setAllNonNull", () => {
  it("sets all non-null properties", () => {
    const target = {};
    setAllNonNull(target, {
      name: "Test",
      value: 42,
      flag: true,
      zero: 0,
      emptyString: "",
      falseBool: false,
    });

    expect(target).toEqual({
      name: "Test",
      value: 42,
      flag: true,
      zero: 0,
      emptyString: "",
      falseBool: false,
    });
  });

  it("skips null values", () => {
    const target = {};
    setAllNonNull(target, {
      name: "Test",
      nullValue: null,
      value: 42,
    });

    expect(target).toEqual({
      name: "Test",
      value: 42,
    });
    expect(target).not.toHaveProperty("nullValue");
  });

  it("skips undefined values", () => {
    const target = {};
    setAllNonNull(target, {
      name: "Test",
      undefinedValue: undefined,
      value: 42,
    });

    expect(target).toEqual({
      name: "Test",
      value: 42,
    });
    expect(target).not.toHaveProperty("undefinedValue");
  });

  it("allows zero as a valid value", () => {
    const target = {};
    setAllNonNull(target, {
      zero: 0,
      negativeZero: -0,
    });

    expect(target).toEqual({
      zero: 0,
      negativeZero: -0,
    });
  });

  it("allows false as a valid value", () => {
    const target = {};
    setAllNonNull(target, {
      flag: false,
    });

    expect(target).toEqual({
      flag: false,
    });
  });

  it("allows empty string as a valid value", () => {
    const target = {};
    setAllNonNull(target, {
      name: "",
    });

    expect(target).toEqual({
      name: "",
    });
  });

  it("updates existing properties", () => {
    const target = {
      existingProp: "original",
      keepThis: "unchanged",
    };

    setAllNonNull(target, {
      existingProp: "updated",
      newProp: "new",
    });

    expect(target).toEqual({
      existingProp: "updated",
      keepThis: "unchanged",
      newProp: "new",
    });
  });

  it("handles empty properties object", () => {
    const target = { existing: "value" };
    setAllNonNull(target, {});

    expect(target).toEqual({
      existing: "value",
    });
  });

  it("handles complex values like objects and arrays", () => {
    const target = {};
    const obj = { nested: "value" };
    const arr = [1, 2, 3];

    setAllNonNull(target, {
      object: obj,
      array: arr,
      nullValue: null,
    });

    expect(target).toEqual({
      object: obj,
      array: arr,
    });
    expect(target.object).toBe(obj); // Same reference
    expect(target.array).toBe(arr); // Same reference
  });

  it("handles mixed null and non-null values", () => {
    const target = {};
    setAllNonNull(target, {
      a: "value",
      b: null,
      c: 42,
      d: undefined,
      e: false,
      f: null,
      g: "another",
    });

    expect(target).toEqual({
      a: "value",
      c: 42,
      e: false,
      g: "another",
    });
  });

  it("returns the target object for chaining", () => {
    const target = { existing: "value" };
    const result = setAllNonNull(target, { new: "property" });

    expect(result).toBe(target);
    expect(result).toEqual({
      existing: "value",
      new: "property",
    });
  });
});

describe("toLiveApiView", () => {
  it("converts lowercase view names to Live API format", () => {
    expect(toLiveApiView("session")).toBe("Session");
    expect(toLiveApiView("arrangement")).toBe("Arranger");
  });

  it("handles mixed case input", () => {
    expect(toLiveApiView("Session")).toBe("Session");
    expect(toLiveApiView("ARRANGEMENT")).toBe("Arranger");
    expect(toLiveApiView("ArRaNgEmEnT")).toBe("Arranger");
  });

  it("throws error for unknown view names", () => {
    expect(() => toLiveApiView("unknown")).toThrow("Unknown view: unknown");
    expect(() => toLiveApiView("")).toThrow("Unknown view: ");
    expect(() => toLiveApiView("arranger")).toThrow("Unknown view: arranger"); // We don't accept "arranger"
  });
});

describe("fromLiveApiView", () => {
  it("converts Live API view names to user-facing view names", () => {
    expect(fromLiveApiView("Session")).toBe("session");
    expect(fromLiveApiView("Arranger")).toBe("arrangement");
  });

  it("throws error for unknown Live API view names", () => {
    expect(() => fromLiveApiView("Unknown")).toThrow("Unknown Live API view: Unknown");
    expect(() => fromLiveApiView("")).toThrow("Unknown Live API view: ");
    expect(() => fromLiveApiView("session")).toThrow("Unknown Live API view: session"); // Should be "Session"
    expect(() => fromLiveApiView("arrangement")).toThrow("Unknown Live API view: arrangement"); // Should be "Arranger"
  });
});

describe("withoutNulls", () => {
  it("creates new object with all non-null properties", () => {
    const result = withoutNulls({
      name: "Test",
      value: 42,
      flag: true,
      zero: 0,
      emptyString: "",
      falseBool: false,
    });

    expect(result).toEqual({
      name: "Test",
      value: 42,
      flag: true,
      zero: 0,
      emptyString: "",
      falseBool: false,
    });
  });

  it("filters out null values", () => {
    const result = withoutNulls({
      name: "Test",
      nullValue: null,
      value: 42,
    });

    expect(result).toEqual({
      name: "Test",
      value: 42,
    });
    expect(result).not.toHaveProperty("nullValue");
  });

  it("filters out undefined values", () => {
    const result = withoutNulls({
      name: "Test",
      undefinedValue: undefined,
      value: 42,
    });

    expect(result).toEqual({
      name: "Test",
      value: 42,
    });
    expect(result).not.toHaveProperty("undefinedValue");
  });

  it("allows zero as a valid value", () => {
    const result = withoutNulls({
      zero: 0,
      negativeZero: -0,
    });

    expect(result).toEqual({
      zero: 0,
      negativeZero: -0,
    });
  });

  it("allows false as a valid value", () => {
    const result = withoutNulls({
      flag: false,
    });

    expect(result).toEqual({
      flag: false,
    });
  });

  it("allows empty string as a valid value", () => {
    const result = withoutNulls({
      name: "",
    });

    expect(result).toEqual({
      name: "",
    });
  });

  it("returns empty object for empty input", () => {
    const result = withoutNulls({});
    expect(result).toEqual({});
  });

  it("handles complex values like objects and arrays", () => {
    const obj = { nested: "value" };
    const arr = [1, 2, 3];

    const result = withoutNulls({
      object: obj,
      array: arr,
      nullValue: null,
    });

    expect(result).toEqual({
      object: obj,
      array: arr,
    });
    expect(result.object).toBe(obj); // Same reference
    expect(result.array).toBe(arr); // Same reference
  });

  it("handles mixed null and non-null values", () => {
    const result = withoutNulls({
      a: "value",
      b: null,
      c: 42,
      d: undefined,
      e: false,
      f: null,
      g: "another",
    });

    expect(result).toEqual({
      a: "value",
      c: 42,
      e: false,
      g: "another",
    });
  });

  it("does not modify the original object", () => {
    const original = {
      keep: "this",
      remove: null,
      alsoKeep: 42,
    };

    const result = withoutNulls(original);

    expect(original).toEqual({
      keep: "this",
      remove: null,
      alsoKeep: 42,
    });

    expect(result).toEqual({
      keep: "this",
      alsoKeep: 42,
    });

    expect(result).not.toBe(original);
  });
});

describe("parseCommaSeparatedIds", () => {
  it("parses simple comma-separated IDs", () => {
    const result = parseCommaSeparatedIds("1,2,3");
    expect(result).toEqual(["1", "2", "3"]);
  });

  it("trims whitespace around IDs", () => {
    const result = parseCommaSeparatedIds("1, 2 , 3");
    expect(result).toEqual(["1", "2", "3"]);
  });

  it("handles extra spaces and mixed formats", () => {
    const result = parseCommaSeparatedIds("  id1  ,  id2,id3  , id4  ");
    expect(result).toEqual(["id1", "id2", "id3", "id4"]);
  });

  it("filters out empty strings", () => {
    const result = parseCommaSeparatedIds("1,,2,,,3");
    expect(result).toEqual(["1", "2", "3"]);
  });

  it("filters out empty strings with spaces", () => {
    const result = parseCommaSeparatedIds("1, , 2,  , 3");
    expect(result).toEqual(["1", "2", "3"]);
  });

  it("handles single ID without commas", () => {
    const result = parseCommaSeparatedIds("single-id");
    expect(result).toEqual(["single-id"]);
  });

  it("handles single ID with trailing comma", () => {
    const result = parseCommaSeparatedIds("single-id,");
    expect(result).toEqual(["single-id"]);
  });

  it("handles complex ID formats", () => {
    const result = parseCommaSeparatedIds("track_1, scene-2, clip:3");
    expect(result).toEqual(["track_1", "scene-2", "clip:3"]);
  });

  it("handles numeric and string IDs mixed", () => {
    const result = parseCommaSeparatedIds("123, id_456, 789");
    expect(result).toEqual(["123", "id_456", "789"]);
  });

  it("returns empty array for empty input after filtering", () => {
    const result = parseCommaSeparatedIds(",,, , ,");
    expect(result).toEqual([]);
  });

  it("handles leading and trailing commas", () => {
    const result = parseCommaSeparatedIds(",1,2,3,");
    expect(result).toEqual(["1", "2", "3"]);
  });
});

describe("parseCommaSeparatedIndices", () => {
  it("parses simple comma-separated indices", () => {
    const result = parseCommaSeparatedIndices("0,1,2");
    expect(result).toEqual([0, 1, 2]);
  });

  it("trims whitespace around indices", () => {
    const result = parseCommaSeparatedIndices("0, 1 , 2");
    expect(result).toEqual([0, 1, 2]);
  });

  it("handles extra spaces", () => {
    const result = parseCommaSeparatedIndices("  0  ,  1,2  , 3  ");
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it("filters out empty strings", () => {
    const result = parseCommaSeparatedIndices("0,,1,,,2");
    expect(result).toEqual([0, 1, 2]);
  });

  it("handles single index without commas", () => {
    const result = parseCommaSeparatedIndices("5");
    expect(result).toEqual([5]);
  });

  it("handles negative indices", () => {
    const result = parseCommaSeparatedIndices("-1, 0, 1");
    expect(result).toEqual([-1, 0, 1]);
  });

  it("handles large indices", () => {
    const result = parseCommaSeparatedIndices("100, 999, 1000");
    expect(result).toEqual([100, 999, 1000]);
  });

  it("throws error for non-numeric strings", () => {
    expect(() => parseCommaSeparatedIndices("0, abc, 2")).toThrow('Invalid index "abc" - must be a valid integer');
  });

  it("handles decimal numbers by truncating to integers", () => {
    // parseInt("1.5", 10) returns 1, so this is expected behavior
    const result = parseCommaSeparatedIndices("0, 1.5, 2");
    expect(result).toEqual([0, 1, 2]);
  });

  it("throws error for mixed valid and invalid", () => {
    expect(() => parseCommaSeparatedIndices("0, 1, invalid")).toThrow(
      'Invalid index "invalid" - must be a valid integer',
    );
  });

  it("returns empty array for empty input after filtering", () => {
    const result = parseCommaSeparatedIndices(",,, , ,");
    expect(result).toEqual([]);
  });

  it("handles leading and trailing commas", () => {
    const result = parseCommaSeparatedIndices(",0,1,2,");
    expect(result).toEqual([0, 1, 2]);
  });
});

describe("parseTimeSignature", () => {
  it("parses common time signatures", () => {
    expect(parseTimeSignature("4/4")).toEqual({ numerator: 4, denominator: 4 });
    expect(parseTimeSignature("3/4")).toEqual({ numerator: 3, denominator: 4 });
    expect(parseTimeSignature("2/4")).toEqual({ numerator: 2, denominator: 4 });
    expect(parseTimeSignature("6/8")).toEqual({ numerator: 6, denominator: 8 });
  });

  it("parses complex time signatures", () => {
    expect(parseTimeSignature("7/8")).toEqual({ numerator: 7, denominator: 8 });
    expect(parseTimeSignature("5/4")).toEqual({ numerator: 5, denominator: 4 });
    expect(parseTimeSignature("9/8")).toEqual({ numerator: 9, denominator: 8 });
    expect(parseTimeSignature("12/8")).toEqual({ numerator: 12, denominator: 8 });
  });

  it("parses unusual time signatures", () => {
    expect(parseTimeSignature("15/16")).toEqual({ numerator: 15, denominator: 16 });
    expect(parseTimeSignature("1/1")).toEqual({ numerator: 1, denominator: 1 });
    expect(parseTimeSignature("11/4")).toEqual({ numerator: 11, denominator: 4 });
  });

  it("handles large numbers", () => {
    expect(parseTimeSignature("128/64")).toEqual({ numerator: 128, denominator: 64 });
  });

  it("throws error for invalid format - missing slash", () => {
    expect(() => parseTimeSignature("44")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
  });

  it("throws error for invalid format - multiple slashes", () => {
    expect(() => parseTimeSignature("4/4/4")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
  });

  it("throws error for invalid format - non-numeric numerator", () => {
    expect(() => parseTimeSignature("four/4")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
  });

  it("throws error for invalid format - non-numeric denominator", () => {
    expect(() => parseTimeSignature("4/four")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
  });

  it("throws error for invalid format - empty numerator", () => {
    expect(() => parseTimeSignature("/4")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
  });

  it("throws error for invalid format - empty denominator", () => {
    expect(() => parseTimeSignature("4/")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
  });

  it("throws error for invalid format - spaces", () => {
    expect(() => parseTimeSignature("4 / 4")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
    expect(() => parseTimeSignature(" 4/4 ")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
  });

  it("throws error for invalid format - decimal numbers", () => {
    expect(() => parseTimeSignature("4.5/4")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
    expect(() => parseTimeSignature("4/4.5")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
  });

  it("throws error for invalid format - negative numbers", () => {
    expect(() => parseTimeSignature("-4/4")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
    expect(() => parseTimeSignature("4/-4")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
  });

  it("throws error for empty string", () => {
    expect(() => parseTimeSignature("")).toThrow('Time signature must be in format "n/m" (e.g. "4/4")');
  });
});
