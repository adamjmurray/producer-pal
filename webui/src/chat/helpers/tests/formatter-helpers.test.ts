// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  isErrorResult,
  safeParseToolArgs,
} from "#webui/chat/helpers/formatter-helpers";

describe("isErrorResult", () => {
  it("detects direct error key in JSON", () => {
    expect(isErrorResult('{"error":"something failed"}')).toBe(true);
  });

  it("detects escaped error key in double-serialized JSON", () => {
    const result = JSON.stringify([
      { type: "text", text: JSON.stringify({ error: "No clip in this slot" }) },
    ]);

    expect(isErrorResult(result)).toBe(true);
  });

  it("detects isError flag", () => {
    expect(isErrorResult('{"isError":true}')).toBe(true);
  });

  it("returns false for normal results", () => {
    expect(isErrorResult('{"id":"1","name":"Track"}')).toBe(false);
  });
});

describe("safeParseToolArgs", () => {
  it("returns empty object for undefined", () => {
    expect(safeParseToolArgs(undefined)).toStrictEqual({});
  });

  it("returns empty object for null", () => {
    expect(safeParseToolArgs(null)).toStrictEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(safeParseToolArgs("")).toStrictEqual({});
  });

  it("parses valid JSON arguments", () => {
    expect(safeParseToolArgs('{"key":"value"}')).toStrictEqual({
      key: "value",
    });
  });

  it("returns empty object for malformed JSON", () => {
    expect(safeParseToolArgs('{"key": broken')).toStrictEqual({});
  });

  it("returns empty object for truncated JSON", () => {
    expect(safeParseToolArgs('{"query": "test')).toStrictEqual({});
  });
});
