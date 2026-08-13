// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for judge-response-parser.ts
 */
import { describe, it, expect } from "vitest";
import {
  parseJudgeResponse,
  parseSimpleJudgeResponse,
} from "./judge-response-parser.ts";

const VALID_RESPONSE = {
  accuracy: { score: 1.0, reasoning: "Correct" },
  reasoning: { score: 0.8, reasoning: "Good logic" },
  efficiency: { score: 0.8, reasoning: "Efficient" },
  naturalness: { score: 0.6, reasoning: "Acceptable" },
};

const VALID_JSON = JSON.stringify(VALID_RESPONSE);

/**
 * Build a judge response from per-dimension scores
 *
 * @param accuracy - accuracy dimension score
 * @param reasoning - reasoning dimension score
 * @param efficiency - efficiency dimension score
 * @param naturalness - naturalness dimension score
 * @returns Judge response object with placeholder reasoning text
 */
function withScores(
  accuracy: unknown,
  reasoning: unknown,
  efficiency: unknown,
  naturalness: unknown,
): Record<string, unknown> {
  return {
    accuracy: { score: accuracy, reasoning: "a" },
    reasoning: { score: reasoning, reasoning: "b" },
    efficiency: { score: efficiency, reasoning: "c" },
    naturalness: { score: naturalness, reasoning: "d" },
  };
}

/**
 * Build a valid response with one dimension removed
 *
 * @param dimension - Name of the dimension to drop
 * @returns Judge response object missing that dimension
 */
function without(dimension: string): Record<string, unknown> {
  const input = withScores(1.0, 0.8, 0.8, 0.8);

  delete input[dimension];

  return input;
}

/**
 * Parse a judge response given as an object
 *
 * @param input - The response object to serialize and parse
 * @returns The parsed judge result
 */
function parse(input: Record<string, unknown>) {
  return parseJudgeResponse(JSON.stringify(input));
}

/**
 * Assert that parsing `input` is rejected as malformed
 *
 * @param input - The response object expected to be invalid
 */
function expectInvalidFormat(input: Record<string, unknown>): void {
  expect(() => parse(input)).toThrow("Invalid judge response format");
}

describe("parseJudgeResponse", () => {
  describe("valid JSON parsing", () => {
    it("parses valid JSON with all dimensions", () => {
      const result = parseJudgeResponse(VALID_JSON);

      expect(result.accuracy).toStrictEqual({
        score: 1.0,
        reasoning: "Correct",
      });
      expect(result.reasoning).toStrictEqual({
        score: 0.8,
        reasoning: "Good logic",
      });
      expect(result.efficiency).toStrictEqual({
        score: 0.8,
        reasoning: "Efficient",
      });
      expect(result.naturalness).toStrictEqual({
        score: 0.6,
        reasoning: "Acceptable",
      });
      expect(result.overall).toBe(0.8);
    });

    it("computes overall as average of 4 dimensions", () => {
      const result = parse(withScores(1.0, 1.0, 0.6, 0.6));

      expect(result.overall).toBe(0.8);
    });

    it("handles decimal average", () => {
      const result = parse(withScores(1.0, 0.8, 0.8, 0.8));

      expect(result.overall).toBeCloseTo(0.85);
    });
  });

  describe("JSON extraction from wrapped text", () => {
    it("extracts JSON from text with prefix", () => {
      const input = `Here is my response: ${VALID_JSON}`;
      const result = parseJudgeResponse(input);

      expect(result.accuracy.score).toBe(1.0);
      expect(result.overall).toBe(0.8);
    });

    it("extracts JSON from text with suffix", () => {
      const input = `${VALID_JSON} That is my evaluation.`;
      const result = parseJudgeResponse(input);

      expect(result.accuracy.score).toBe(1.0);
    });

    it("extracts JSON from markdown code block content", () => {
      const input = `\`\`\`json\n${VALID_JSON}\n\`\`\``;
      const result = parseJudgeResponse(input);

      expect(result.accuracy.score).toBe(1.0);
    });

    it("extracts JSON surrounded by whitespace and text", () => {
      const input = `\n\nBased on my analysis:\n${VALID_JSON}\n\nEnd.`;
      const result = parseJudgeResponse(input);

      expect(result.accuracy.score).toBe(1.0);
    });
  });

  describe("invalid format handling", () => {
    it("throws error for missing accuracy dimension", () => {
      expectInvalidFormat(without("accuracy"));
    });

    it("throws error for missing reasoning dimension", () => {
      expectInvalidFormat(without("reasoning"));
    });

    it("throws error for missing efficiency dimension", () => {
      expectInvalidFormat(without("efficiency"));
    });

    it("throws error for missing naturalness dimension", () => {
      expectInvalidFormat(without("naturalness"));
    });

    it("throws error for non-number score", () => {
      expectInvalidFormat(withScores("high", 0.8, 0.8, 0.8));
    });

    it("throws error for non-string reasoning", () => {
      expectInvalidFormat({
        ...withScores(1.0, 0.8, 0.8, 0.8),
        accuracy: { score: 1.0, reasoning: 123 },
      });
    });

    it("throws error for plain text without JSON", () => {
      const input = "This is just plain text without any JSON";

      expect(() => parseJudgeResponse(input)).toThrow(
        "Failed to extract JSON from",
      );
    });

    it("throws error for empty string", () => {
      const input = "";

      expect(() => parseJudgeResponse(input)).toThrow(
        "Failed to extract JSON from",
      );
    });

    it("throws error for invalid JSON syntax", () => {
      const input = '{"accuracy": {"score": 5, "reasoning": "missing closing';

      expect(() => parseJudgeResponse(input)).toThrow();
    });
  });

  describe("edge cases", () => {
    it("handles reasoning with special characters", () => {
      const result = parse({
        ...withScores(1.0, 0.8, 0.8, 0.8),
        accuracy: {
          score: 1.0,
          reasoning: 'Contains "quotes" and \n newlines',
        },
      });

      expect(result.accuracy.score).toBe(1.0);
      expect(result.accuracy.reasoning).toContain("quotes");
    });

    it("handles decimal scores", () => {
      const result = parse(withScores(0.9, 0.9, 0.9, 0.9));

      expect(result.overall).toBe(0.9);
    });

    it("ignores extra fields in JSON", () => {
      const result = parse({
        ...VALID_RESPONSE,
        extra: "ignored",
        another: 123,
      });

      expect(result.accuracy.score).toBe(1.0);
      expect(result.overall).toBe(0.8);
    });
  });
});

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
