// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  assertDefined,
  errorMessage,
  errorPayloadMessage,
} from "../error-message.ts";

describe("errorMessage", () => {
  it("should extract message from Error instance", () => {
    const error = new Error("test error message");

    expect(errorMessage(error)).toBe("test error message");
  });

  it("should convert non-Error values to string", () => {
    expect(errorMessage("string error")).toBe("string error");
    expect(errorMessage(123)).toBe("123");
    expect(errorMessage({ message: "object" })).toBe("[object Object]");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});

describe("errorPayloadMessage", () => {
  it("prefers the nested message over the wrapper's own", () => {
    expect(
      errorPayloadMessage({
        message: "Provider returned error",
        error: { message: "rate limited" },
      }),
    ).toBe("rate limited");
    expect(errorPayloadMessage({ error: { error: { message: "deep" } } })).toBe(
      "deep",
    );
  });

  it("falls back to message, a string error, then detail", () => {
    expect(errorPayloadMessage({ message: "top", error: { code: 429 } })).toBe(
      "top",
    );
    expect(errorPayloadMessage({ error: "oops" })).toBe("oops");
    expect(errorPayloadMessage({ message: "", detail: "why" })).toBe("why");
  });

  it("returns undefined when there is no message", () => {
    expect(errorPayloadMessage({ code: 1 })).toBeUndefined();
    expect(errorPayloadMessage("text")).toBeUndefined();
    expect(errorPayloadMessage(null)).toBeUndefined();
  });
});

describe("assertDefined", () => {
  it("returns the value when defined", () => {
    expect(assertDefined("hello", "should exist")).toBe("hello");
    expect(assertDefined(42, "should exist")).toBe(42);
    expect(assertDefined(0, "should exist")).toBe(0);
    expect(assertDefined(false, "should exist")).toBe(false);
    expect(assertDefined("", "should exist")).toBe("");
  });

  it("returns objects and arrays when defined", () => {
    const obj = { key: "value" };
    const arr = [1, 2, 3];

    expect(assertDefined(obj, "should exist")).toBe(obj);
    expect(assertDefined(arr, "should exist")).toBe(arr);
  });

  it("throws for null", () => {
    expect(() => assertDefined(null, "value was null")).toThrow(
      "Bug: value was null",
    );
  });

  it("throws for undefined", () => {
    expect(() => assertDefined(undefined, "value was undefined")).toThrow(
      "Bug: value was undefined",
    );
  });

  it("includes the message in the error", () => {
    expect(() => assertDefined(null, "custom error message")).toThrow(
      "Bug: custom error message",
    );
  });
});
