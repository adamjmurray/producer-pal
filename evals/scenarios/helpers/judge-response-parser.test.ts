// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for judge-response-parser.ts
 */
import { describe, it, expect } from "vitest";
import { parseJudgeResponse } from "./judge-response-parser.ts";

const VALID_RESPONSE = {
  accuracy: { score: 1.0, reasoning: "Correct" },
  reasoning: { score: 0.8, reasoning: "Good logic" },
  efficiency: { score: 0.8, reasoning: "Efficient" },
  naturalness: { score: 0.6, reasoning: "Acceptable" },
};

const VALID_JSON = JSON.stringify(VALID_RESPONSE);

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
      const input = {
        accuracy: { score: 1.0, reasoning: "a" },
        reasoning: { score: 1.0, reasoning: "b" },
        efficiency: { score: 0.6, reasoning: "c" },
        naturalness: { score: 0.6, reasoning: "d" },
      };
      const result = parseJudgeResponse(JSON.stringify(input));

      expect(result.overall).toBe(0.8);
    });

    it("handles decimal average", () => {
      const input = {
        accuracy: { score: 1.0, reasoning: "a" },
        reasoning: { score: 0.8, reasoning: "b" },
        efficiency: { score: 0.8, reasoning: "c" },
        naturalness: { score: 0.8, reasoning: "d" },
      };
      const result = parseJudgeResponse(JSON.stringify(input));

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
      const input = {
        reasoning: { score: 0.8, reasoning: "b" },
        efficiency: { score: 0.8, reasoning: "c" },
        naturalness: { score: 0.8, reasoning: "d" },
      };

      expect(() => parseJudgeResponse(JSON.stringify(input))).toThrow(
        "Invalid judge response format",
      );
    });

    it("throws error for missing reasoning dimension", () => {
      const input = {
        accuracy: { score: 1.0, reasoning: "a" },
        efficiency: { score: 0.8, reasoning: "c" },
        naturalness: { score: 0.8, reasoning: "d" },
      };

      expect(() => parseJudgeResponse(JSON.stringify(input))).toThrow(
        "Invalid judge response format",
      );
    });

    it("throws error for missing efficiency dimension", () => {
      const input = {
        accuracy: { score: 1.0, reasoning: "a" },
        reasoning: { score: 0.8, reasoning: "b" },
        naturalness: { score: 0.8, reasoning: "d" },
      };

      expect(() => parseJudgeResponse(JSON.stringify(input))).toThrow(
        "Invalid judge response format",
      );
    });

    it("throws error for missing naturalness dimension", () => {
      const input = {
        accuracy: { score: 1.0, reasoning: "a" },
        reasoning: { score: 0.8, reasoning: "b" },
        efficiency: { score: 0.8, reasoning: "c" },
      };

      expect(() => parseJudgeResponse(JSON.stringify(input))).toThrow(
        "Invalid judge response format",
      );
    });

    it("throws error for non-number score", () => {
      const input = {
        accuracy: { score: "high", reasoning: "a" },
        reasoning: { score: 0.8, reasoning: "b" },
        efficiency: { score: 0.8, reasoning: "c" },
        naturalness: { score: 0.8, reasoning: "d" },
      };

      expect(() => parseJudgeResponse(JSON.stringify(input))).toThrow(
        "Invalid judge response format",
      );
    });

    it("throws error for non-string reasoning", () => {
      const input = {
        accuracy: { score: 1.0, reasoning: 123 },
        reasoning: { score: 0.8, reasoning: "b" },
        efficiency: { score: 0.8, reasoning: "c" },
        naturalness: { score: 0.8, reasoning: "d" },
      };

      expect(() => parseJudgeResponse(JSON.stringify(input))).toThrow(
        "Invalid judge response format",
      );
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
      const input = {
        accuracy: {
          score: 1.0,
          reasoning: 'Contains "quotes" and \n newlines',
        },
        reasoning: { score: 0.8, reasoning: "b" },
        efficiency: { score: 0.8, reasoning: "c" },
        naturalness: { score: 0.8, reasoning: "d" },
      };
      const result = parseJudgeResponse(JSON.stringify(input));

      expect(result.accuracy.score).toBe(1.0);
      expect(result.accuracy.reasoning).toContain("quotes");
    });

    it("handles decimal scores", () => {
      const input = {
        accuracy: { score: 0.9, reasoning: "a" },
        reasoning: { score: 0.9, reasoning: "b" },
        efficiency: { score: 0.9, reasoning: "c" },
        naturalness: { score: 0.9, reasoning: "d" },
      };
      const result = parseJudgeResponse(JSON.stringify(input));

      expect(result.overall).toBe(0.9);
    });

    it("ignores extra fields in JSON", () => {
      const input = {
        ...VALID_RESPONSE,
        extra: "ignored",
        another: 123,
      };
      const result = parseJudgeResponse(JSON.stringify(input));

      expect(result.accuracy.score).toBe(1.0);
      expect(result.overall).toBe(0.8);
    });
  });
});
