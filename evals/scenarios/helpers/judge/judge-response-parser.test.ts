// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Tests for judge-response-parser.ts
 */
import { describe, it, expect } from "vitest";
import { parseSimpleJudgeResponse } from "./judge-response-parser.ts";

describe("parseSimpleJudgeResponse", () => {
  it("parses a passing response", () => {
    const result = parseSimpleJudgeResponse('{"pass": true, "issues": []}');

    expect(result.pass).toBe(true);
    expect(result.issues).toStrictEqual([]);
  });

  it("parses a failing response with issues", () => {
    const input = JSON.stringify({
      pass: false,
      issues: ["Missing confirmation", "Wrong tool used"],
    });
    const result = parseSimpleJudgeResponse(input);

    expect(result.pass).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toBe("Missing confirmation");
  });

  it("extracts JSON from surrounding text", () => {
    const input = 'Here is my response: {"pass": true, "issues": []}';
    const result = parseSimpleJudgeResponse(input);

    expect(result.pass).toBe(true);
  });

  it("extracts JSON followed by text", () => {
    const input = '{"pass": true, "issues": []} That is my evaluation.';

    expect(parseSimpleJudgeResponse(input).pass).toBe(true);
  });

  it("extracts JSON from a markdown code block", () => {
    const input = '```json\n{"pass": false, "issues": ["a {brace}"]}\n```';

    expect(parseSimpleJudgeResponse(input).issues).toStrictEqual(["a {brace}"]);
  });

  it.each([
    ["plain text", "This is just plain text without any JSON"],
    ["an empty string", ""],
    ["unterminated JSON", '{"pass": true, "issues": ["missing closing'],
  ])("throws on %s", (_label, input) => {
    expect(() => parseSimpleJudgeResponse(input)).toThrow(
      "Failed to extract JSON from",
    );
  });

  it("throws on a non-object response", () => {
    expect(() => parseSimpleJudgeResponse("null")).toThrow(
      "Invalid simple judge response",
    );
  });

  it("throws on missing pass field", () => {
    expect(() => parseSimpleJudgeResponse('{"issues": []}')).toThrow(
      "Invalid simple judge response",
    );
  });

  it("throws on non-boolean pass", () => {
    expect(() =>
      parseSimpleJudgeResponse('{"pass": "yes", "issues": []}'),
    ).toThrow("Invalid simple judge response");
  });

  it("throws on non-array issues", () => {
    expect(() =>
      parseSimpleJudgeResponse('{"pass": true, "issues": "none"}'),
    ).toThrow("Invalid simple judge response");
  });

  it("throws on non-string items in issues", () => {
    expect(() =>
      parseSimpleJudgeResponse('{"pass": false, "issues": [123]}'),
    ).toThrow("Invalid simple judge response");
  });
});
