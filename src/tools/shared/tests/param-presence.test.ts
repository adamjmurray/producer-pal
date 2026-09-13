// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  parseCommaSeparatedIds,
  setAllNonNull,
  withoutNulls,
} from "#src/tools/shared/helpers/param-presence.ts";

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

    expect(target).toStrictEqual({
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

    expect(target).toStrictEqual({
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

    expect(target).toStrictEqual({
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

    expect(target).toStrictEqual({
      zero: 0,
      negativeZero: -0,
    });
  });

  it("allows false as a valid value", () => {
    const target = {};

    setAllNonNull(target, {
      flag: false,
    });

    expect(target).toStrictEqual({
      flag: false,
    });
  });

  it("allows empty string as a valid value", () => {
    const target = {};

    setAllNonNull(target, {
      name: "",
    });

    expect(target).toStrictEqual({
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

    expect(target).toStrictEqual({
      existingProp: "updated",
      keepThis: "unchanged",
      newProp: "new",
    });
  });

  it("handles empty properties object", () => {
    const target = { existing: "value" };

    setAllNonNull(target, {});

    expect(target).toStrictEqual({
      existing: "value",
    });
  });

  it("handles complex values like objects and arrays", () => {
    const target: Record<string, unknown> = {};
    const obj = { nested: "value" };
    const arr = [1, 2, 3];

    setAllNonNull(target, {
      object: obj,
      array: arr,
      nullValue: null,
    });

    expect(target).toStrictEqual({
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

    expect(target).toStrictEqual({
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
    expect(result).toStrictEqual({
      existing: "value",
      new: "property",
    });
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

    expect(result).toStrictEqual({
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

    expect(result).toStrictEqual({
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

    expect(result).toStrictEqual({
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

    expect(result).toStrictEqual({
      zero: 0,
      negativeZero: -0,
    });
  });

  it("allows false as a valid value", () => {
    const result = withoutNulls({
      flag: false,
    });

    expect(result).toStrictEqual({
      flag: false,
    });
  });

  it("allows empty string as a valid value", () => {
    const result = withoutNulls({
      name: "",
    });

    expect(result).toStrictEqual({
      name: "",
    });
  });

  it("returns empty object for empty input", () => {
    const result = withoutNulls({});

    expect(result).toStrictEqual({});
  });

  it("handles complex values like objects and arrays", () => {
    const obj = { nested: "value" };
    const arr = [1, 2, 3];

    const result = withoutNulls({
      object: obj,
      array: arr,
      nullValue: null,
    });

    expect(result).toStrictEqual({
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

    expect(result).toStrictEqual({
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

    expect(original).toStrictEqual({
      keep: "this",
      remove: null,
      alsoKeep: 42,
    });

    expect(result).toStrictEqual({
      keep: "this",
      alsoKeep: 42,
    });

    expect(result).not.toBe(original);
  });
});

describe("parseCommaSeparatedIds", () => {
  it("parses simple comma-separated IDs", () => {
    const result = parseCommaSeparatedIds("1,2,3");

    expect(result).toStrictEqual(["1", "2", "3"]);
  });

  it("trims whitespace around IDs", () => {
    const result = parseCommaSeparatedIds("1, 2 , 3");

    expect(result).toStrictEqual(["1", "2", "3"]);
  });

  it("handles extra spaces and mixed formats", () => {
    const result = parseCommaSeparatedIds("  id1  ,  id2,id3  , id4  ");

    expect(result).toStrictEqual(["id1", "id2", "id3", "id4"]);
  });

  it("filters out empty strings", () => {
    const result = parseCommaSeparatedIds("1,,2,,,3");

    expect(result).toStrictEqual(["1", "2", "3"]);
  });

  it("filters out empty strings with spaces", () => {
    const result = parseCommaSeparatedIds("1, , 2,  , 3");

    expect(result).toStrictEqual(["1", "2", "3"]);
  });

  it("handles single ID without commas", () => {
    const result = parseCommaSeparatedIds("single-id");

    expect(result).toStrictEqual(["single-id"]);
  });

  it("handles single ID with trailing comma", () => {
    const result = parseCommaSeparatedIds("single-id,");

    expect(result).toStrictEqual(["single-id"]);
  });

  it("handles complex ID formats", () => {
    const result = parseCommaSeparatedIds("track_1, scene-2, clip:3");

    expect(result).toStrictEqual(["track_1", "scene-2", "clip:3"]);
  });

  it("handles numeric and string IDs mixed", () => {
    const result = parseCommaSeparatedIds("123, id_456, 789");

    expect(result).toStrictEqual(["123", "id_456", "789"]);
  });

  it("returns empty array for empty input after filtering", () => {
    const result = parseCommaSeparatedIds(",,, , ,");

    expect(result).toStrictEqual([]);
  });

  it("handles leading and trailing commas", () => {
    const result = parseCommaSeparatedIds(",1,2,3,");

    expect(result).toStrictEqual(["1", "2", "3"]);
  });

  it("returns empty array for null or undefined", () => {
    expect(parseCommaSeparatedIds(null)).toStrictEqual([]);
    expect(parseCommaSeparatedIds(undefined)).toStrictEqual([]);
  });
});
