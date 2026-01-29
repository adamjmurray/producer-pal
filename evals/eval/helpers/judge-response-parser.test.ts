/**
 * Tests for judge-response-parser.ts
 */
import { describe, it, expect } from "vitest";
import { parseJudgeResponse } from "./judge-response-parser.ts";

describe("parseJudgeResponse", () => {
  describe("valid JSON parsing", () => {
    it("parses valid JSON with score and reasoning", () => {
      const input = '{"score": 8, "reasoning": "Good response"}';
      const result = parseJudgeResponse(input);

      expect(result).toStrictEqual({ score: 8, reasoning: "Good response" });
    });

    it("parses JSON with score 0", () => {
      const input = '{"score": 0, "reasoning": "Failed completely"}';
      const result = parseJudgeResponse(input);

      expect(result).toStrictEqual({
        score: 0,
        reasoning: "Failed completely",
      });
    });

    it("parses JSON with score 10", () => {
      const input = '{"score": 10, "reasoning": "Perfect response"}';
      const result = parseJudgeResponse(input);

      expect(result).toStrictEqual({
        score: 10,
        reasoning: "Perfect response",
      });
    });

    it("parses JSON with empty reasoning", () => {
      const input = '{"score": 5, "reasoning": ""}';
      const result = parseJudgeResponse(input);

      expect(result).toStrictEqual({ score: 5, reasoning: "" });
    });
  });

  describe("JSON extraction from wrapped text", () => {
    it("extracts JSON from text with prefix", () => {
      const input = 'Here is my response: {"score": 7, "reasoning": "Good"}';
      const result = parseJudgeResponse(input);

      expect(result).toStrictEqual({ score: 7, reasoning: "Good" });
    });

    it("extracts JSON from text with suffix", () => {
      const input = '{"score": 6, "reasoning": "Okay"} That is my evaluation.';
      const result = parseJudgeResponse(input);

      expect(result).toStrictEqual({ score: 6, reasoning: "Okay" });
    });

    it("extracts JSON from markdown code block content", () => {
      const input = '```json\n{"score": 9, "reasoning": "Excellent"}\n```';
      const result = parseJudgeResponse(input);

      expect(result).toStrictEqual({ score: 9, reasoning: "Excellent" });
    });

    it("extracts JSON surrounded by whitespace and text", () => {
      const input =
        '\n\nBased on my analysis:\n{"score": 4, "reasoning": "Needs work"}\n\nEnd.';
      const result = parseJudgeResponse(input);

      expect(result).toStrictEqual({ score: 4, reasoning: "Needs work" });
    });
  });

  describe("invalid format handling", () => {
    it("throws error for missing score field", () => {
      const input = '{"reasoning": "No score provided"}';

      expect(() => parseJudgeResponse(input)).toThrow(
        "Failed to parse judge response",
      );
    });

    it("throws error for missing reasoning field", () => {
      const input = '{"score": 5}';

      expect(() => parseJudgeResponse(input)).toThrow(
        "Failed to parse judge response",
      );
    });

    it("throws error for non-number score", () => {
      const input = '{"score": "high", "reasoning": "Good"}';

      expect(() => parseJudgeResponse(input)).toThrow(
        "Failed to parse judge response",
      );
    });

    it("throws error for non-string reasoning", () => {
      const input = '{"score": 5, "reasoning": 123}';

      expect(() => parseJudgeResponse(input)).toThrow(
        "Failed to parse judge response",
      );
    });

    it("throws error for plain text without JSON", () => {
      const input = "This is just plain text without any JSON";

      expect(() => parseJudgeResponse(input)).toThrow(
        "Failed to parse judge response",
      );
    });

    it("throws error for empty string", () => {
      const input = "";

      expect(() => parseJudgeResponse(input)).toThrow(
        "Failed to parse judge response",
      );
    });

    it("throws error for invalid JSON syntax", () => {
      const input = '{"score": 5, "reasoning": "missing closing brace"';

      expect(() => parseJudgeResponse(input)).toThrow(
        "Failed to parse judge response",
      );
    });
  });

  describe("edge cases", () => {
    it("handles reasoning with special characters", () => {
      const input =
        '{"score": 7, "reasoning": "Contains \\"quotes\\" and \\n newlines"}';
      const result = parseJudgeResponse(input);

      expect(result.score).toBe(7);
      expect(result.reasoning).toContain("quotes");
    });

    it("handles decimal scores", () => {
      const input = '{"score": 7.5, "reasoning": "Partial credit"}';
      const result = parseJudgeResponse(input);

      expect(result).toStrictEqual({ score: 7.5, reasoning: "Partial credit" });
    });

    it("handles negative scores", () => {
      const input = '{"score": -1, "reasoning": "Invalid but parseable"}';
      const result = parseJudgeResponse(input);

      expect(result).toStrictEqual({
        score: -1,
        reasoning: "Invalid but parseable",
      });
    });

    it("ignores extra fields in JSON", () => {
      const input =
        '{"score": 8, "reasoning": "Good", "extra": "ignored", "another": 123}';
      const result = parseJudgeResponse(input);

      expect(result.score).toBe(8);
      expect(result.reasoning).toBe("Good");
    });
  });
});
