// src/utils.test.js
import { describe, expect, it } from "vitest";
import { setAllNonNull } from "./utils";

describe("setAllNonNull", () => {
  it("sets all non-null properties", () => {
    const target = {};
    setAllNonNull(target, {
      name: "Test",
      value: 42,
      flag: true,
      zero: 0,
      emptyString: "",
      falseBool: false
    });

    expect(target).toEqual({
      name: "Test",
      value: 42,
      flag: true,
      zero: 0,
      emptyString: "",
      falseBool: false
    });
  });

  it("skips null values", () => {
    const target = {};
    setAllNonNull(target, {
      name: "Test",
      nullValue: null,
      value: 42
    });

    expect(target).toEqual({
      name: "Test",
      value: 42
    });
    expect(target).not.toHaveProperty("nullValue");
  });

  it("skips undefined values", () => {
    const target = {};
    setAllNonNull(target, {
      name: "Test",
      undefinedValue: undefined,
      value: 42
    });

    expect(target).toEqual({
      name: "Test",
      value: 42
    });
    expect(target).not.toHaveProperty("undefinedValue");
  });

  it("allows zero as a valid value", () => {
    const target = {};
    setAllNonNull(target, {
      zero: 0,
      negativeZero: -0
    });

    expect(target).toEqual({
      zero: 0,
      negativeZero: -0
    });
  });

  it("allows false as a valid value", () => {
    const target = {};
    setAllNonNull(target, {
      flag: false
    });

    expect(target).toEqual({
      flag: false
    });
  });

  it("allows empty string as a valid value", () => {
    const target = {};
    setAllNonNull(target, {
      name: ""
    });

    expect(target).toEqual({
      name: ""
    });
  });

  it("updates existing properties", () => {
    const target = {
      existingProp: "original",
      keepThis: "unchanged"
    };

    setAllNonNull(target, {
      existingProp: "updated",
      newProp: "new"
    });

    expect(target).toEqual({
      existingProp: "updated",
      keepThis: "unchanged",
      newProp: "new"
    });
  });

  it("handles empty properties object", () => {
    const target = { existing: "value" };
    setAllNonNull(target, {});

    expect(target).toEqual({
      existing: "value"
    });
  });

  it("handles complex values like objects and arrays", () => {
    const target = {};
    const obj = { nested: "value" };
    const arr = [1, 2, 3];

    setAllNonNull(target, {
      object: obj,
      array: arr,
      nullValue: null
    });

    expect(target).toEqual({
      object: obj,
      array: arr
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
      g: "another"
    });

    expect(target).toEqual({
      a: "value",
      c: 42,
      e: false,
      g: "another"
    });
  });
});