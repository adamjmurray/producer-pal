// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { expect } from "vitest";

/**
 * JSON stringify for inspection
 * @param obj - Object to inspect
 * @returns JSON string
 */
const inspect = (obj: unknown): string => JSON.stringify(obj, null, 2);
const EXPECTED_MOCK_FUNCTION_MSG = "Expected a mock function";

interface MatcherResult {
  pass: boolean;
  message: () => string;
}

interface MockFunction {
  mock: {
    calls: unknown[][];
    contexts: unknown[];
  };
}

/**
 * Validates and casts a value to MockFunction
 * @param received - Value to validate
 * @returns Error result if invalid, or validated mock data if valid
 */
function validateMockFunction(
  received: unknown,
): MatcherResult | { calls: unknown[][]; contexts: unknown[] } {
  const rec = received as MockFunction & ((...args: unknown[]) => unknown);

  if (typeof rec !== "function" || !("mock" in rec)) {
    return { pass: false, message: () => EXPECTED_MOCK_FUNCTION_MSG };
  }

  return rec.mock;
}

/**
 * Format call list for error messages
 * @param calls - Array of call arguments
 * @param contexts - Array of this contexts
 * @returns Formatted string
 */
function formatCalls(calls: unknown[][], contexts: unknown[]): string {
  return calls
    .map((call, index) => {
      return (
        `  Call ${index + 1}:\n` +
        `    Context: ${inspect(contexts[index])}\n` +
        `    Args: ${inspect(call)}`
      );
    })
    .join("\n");
}

expect.extend({
  /**
   * Assert mock was called with specific this context and args
   * @param received - Mock function to check
   * @param expectedThis - Expected this context
   * @param expectedArgs - Expected arguments
   * @returns Matcher result
   */
  toHaveBeenCalledWithThis(
    received: unknown,
    expectedThis: unknown,
    ...expectedArgs: unknown[]
  ): MatcherResult {
    const result = validateMockFunction(received);

    if ("pass" in result) {
      return result;
    }

    const { calls, contexts } = result;

    if (calls.length === 0 || contexts.length === 0) {
      return {
        pass: false,
        message: () => "Expected mock function to have been called",
      };
    }

    const hasMatchingCall = calls.some((call, index) => {
      const context = contexts[index];

      const contextMatches = this.equals(context, expectedThis);
      const argsMatch = this.equals(call, expectedArgs);

      return contextMatches && argsMatch;
    });

    if (hasMatchingCall) {
      return {
        pass: true,
        message: () =>
          `Expected mock function not to have been called with this context and args:\n` +
          `  Context: ${inspect(expectedThis)}\n` +
          `  Args: ${inspect(expectedArgs)}`,
      };
    }

    return {
      pass: false,
      message: () =>
        `Expected mock function to have been called with:\n` +
        `  Context: ${inspect(expectedThis)}\n` +
        `  Args: ${inspect(expectedArgs)}\n\n` +
        `But it was called with:\n` +
        formatCalls(calls, contexts),
    };
  },

  /**
   * Assert mock's nth call had specific this context and args
   * @param received - Mock function to check
   * @param nthCall - Call number (1-indexed)
   * @param expectedThis - Expected this context
   * @param expectedArgs - Expected arguments
   * @returns Matcher result
   */
  toHaveBeenNthCalledWithThis(
    received: unknown,
    nthCall: unknown,
    expectedThis: unknown,
    ...expectedArgs: unknown[]
  ): MatcherResult {
    const result = validateMockFunction(received);

    if ("pass" in result) {
      return result;
    }

    const { calls, contexts } = result;

    if (typeof nthCall !== "number" || nthCall < 1) {
      return {
        pass: false,
        message: () => "Expected nthCall to be a positive number (1-indexed)",
      };
    }

    if (calls.length < nthCall) {
      return {
        pass: false,
        message: () =>
          `Expected mock function to have been called at least ${nthCall} times, but it was called ${calls.length} times`,
      };
    }

    const callIndex = nthCall - 1;
    const actualCall = calls[callIndex];
    const actualContext = contexts[callIndex];

    const contextMatches = this.equals(actualContext, expectedThis);
    const argsMatch = this.equals(actualCall, expectedArgs);

    if (contextMatches && argsMatch) {
      return {
        pass: true,
        message: () =>
          `Expected mock function not to have been called the ${nthCall}th time with:\n` +
          `  Context: ${inspect(expectedThis)}\n` +
          `  Args: ${inspect(expectedArgs)}`,
      };
    }

    return {
      pass: false,
      message: () =>
        `Expected mock function to have been called the ${nthCall}th time with:\n` +
        `  Context: ${inspect(expectedThis)}\n` +
        `  Args: ${inspect(expectedArgs)}\n\n` +
        `But the ${nthCall}th call was:\n` +
        `  Context: ${inspect(actualContext)}\n` +
        `  Args: ${inspect(actualCall)}`,
    };
  },

  /**
   * Assert mock was called exactly once with specific this context and args
   * @param received - Mock function to check
   * @param expectedThis - Expected this context
   * @param expectedArgs - Expected arguments
   * @returns Matcher result
   */
  toHaveBeenCalledExactlyOnceWithThis(
    received: unknown,
    expectedThis: unknown,
    ...expectedArgs: unknown[]
  ): MatcherResult {
    const result = validateMockFunction(received);

    if ("pass" in result) {
      return result;
    }

    const { calls, contexts } = result;

    if (calls.length === 0) {
      return {
        pass: false,
        message: () =>
          "Expected mock function to have been called exactly once, but it was not called",
      };
    }

    if (calls.length > 1) {
      return {
        pass: false,
        message: () =>
          `Expected mock function to have been called exactly once, but it was called ${calls.length} times:\n` +
          formatCalls(calls, contexts),
      };
    }

    const actualCall = calls[0];
    const actualContext = contexts[0];

    const contextMatches = this.equals(actualContext, expectedThis);
    const argsMatch = this.equals(actualCall, expectedArgs);

    if (contextMatches && argsMatch) {
      return {
        pass: true,
        message: () =>
          `Expected mock function not to have been called exactly once with:\n` +
          `  Context: ${inspect(expectedThis)}\n` +
          `  Args: ${inspect(expectedArgs)}`,
      };
    }

    return {
      pass: false,
      message: () =>
        `Expected mock function to have been called exactly once with:\n` +
        `  Context: ${inspect(expectedThis)}\n` +
        `  Args: ${inspect(expectedArgs)}\n\n` +
        `But it was called once with:\n` +
        `  Context: ${inspect(actualContext)}\n` +
        `  Args: ${inspect(actualCall)}`,
    };
  },
});
