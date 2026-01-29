import { describe, it, expect } from "vitest";
import { assertResponseContains } from "./response.ts";
import type { EvalTurnResult, ResponseContainsAssertion } from "../types.ts";

const createTurn = (response: string, turnIndex = 0): EvalTurnResult => ({
  turnIndex,
  userMessage: "test message",
  assistantResponse: response,
  toolCalls: [],
  durationMs: 100,
});

describe("assertResponseContains", () => {
  describe("string pattern matching", () => {
    it("passes when response contains the string", () => {
      const turns = [
        createTurn("The drum beat has been created successfully."),
      ];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "created successfully",
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(true);
      expect(result.message).toContain('contains "created successfully"');
    });

    it("fails when response does not contain the string", () => {
      const turns = [createTurn("Something went wrong.")];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "created successfully",
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("Expected response to contain");
    });

    it("matches case-insensitively", () => {
      const turns = [createTurn("SUCCESS!")];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "success",
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(true);
    });

    it("escapes regex special characters in string patterns", () => {
      const turns = [createTurn("The value is $100.00 (USD)")];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "$100.00",
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(true);
    });
  });

  describe("regex pattern matching", () => {
    it("passes when response matches regex", () => {
      const turns = [createTurn("Created 4 clips on track 1")];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: /created \d+ clips/i,
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(true);
    });

    it("fails when response does not match regex", () => {
      const turns = [createTurn("No clips were created")];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: /created \d+ clips/i,
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(false);
    });

    it("includes regex pattern in message", () => {
      const turns = [createTurn("test")];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: /foo|bar/,
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.message).toContain("/foo|bar/");
    });
  });

  describe("negation", () => {
    it("passes when response does not contain pattern with negate=true", () => {
      const turns = [createTurn("Operation completed successfully")];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "error",
        negate: true,
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(true);
      expect(result.message).toContain("not contains");
    });

    it("fails when response contains pattern with negate=true", () => {
      const turns = [createTurn("An error occurred")];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "error",
        negate: true,
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(false);
      expect(result.message).toContain("to not contain");
    });
  });

  describe("turn filtering", () => {
    it("checks specific turn when specified", () => {
      const turns = [
        createTurn("First response", 0),
        createTurn("Second response with target", 1),
      ];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "target",
        turn: 1,
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(true);
    });

    it("fails when pattern not in specified turn", () => {
      const turns = [
        createTurn("Response with target", 0),
        createTurn("Different response", 1),
      ];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "target",
        turn: 1,
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(false);
    });

    it("checks all turns when turn is any or undefined", () => {
      const turns = [
        createTurn("First response", 0),
        createTurn("Second response with target", 1),
      ];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "target",
        turn: "any",
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(true);
    });

    it("handles out-of-range turn index gracefully", () => {
      const turns = [createTurn("Only response", 0)];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "response",
        turn: 5,
      };

      const result = assertResponseContains(assertion, turns);

      expect(result.passed).toBe(false);
    });
  });

  describe("result details", () => {
    it("includes pattern and match info in details", () => {
      const turns = [createTurn("test response", 0)];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "response",
      };

      const result = assertResponseContains(assertion, turns);
      const details = result.details as {
        pattern: string;
        found: boolean;
        matchingTurnIndices: number[];
      };

      expect(details.pattern).toBe('"response"');
      expect(details.found).toBe(true);
      expect(details.matchingTurnIndices).toStrictEqual([0]);
    });

    it("shows which turns matched", () => {
      const turns = [
        createTurn("Has keyword", 0),
        createTurn("No match", 1),
        createTurn("Also has keyword", 2),
      ];
      const assertion: ResponseContainsAssertion = {
        type: "response_contains",
        pattern: "keyword",
      };

      const result = assertResponseContains(assertion, turns);
      const details = result.details as { matchingTurnIndices: number[] };

      expect(details.matchingTurnIndices).toStrictEqual([0, 2]);
    });
  });
});
