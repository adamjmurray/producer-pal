// src/expect-extensions.js
import { expect } from "vitest";

const inspect = (obj) => JSON.stringify(obj, null, 2);

expect.extend({
  toHaveBeenCalledWithThis(received, expectedThis, ...expectedArgs) {
    if (typeof received !== "function" || !received.mock) {
      return { pass: false, message: () => "Expected a mock function" };
    }

    const { calls, contexts } = received.mock;

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
      message: () => {
        return (
          `Expected mock function to have been called with:\n` +
          `  Context: ${inspect(expectedThis)}\n` +
          `  Args: ${inspect(expectedArgs)}\n\n` +
          `But it was called with:\n` +
          calls
            .map((call, index) => {
              return (
                `  Call ${index + 1}:\n` +
                `    Context: ${inspect(contexts[index])}\n` +
                `    Args: ${inspect(call)}`
              );
            })
            .join("\n")
        );
      },
    };
  },

  toHaveBeenNthCalledWithThis(
    received,
    nthCall,
    expectedThis,
    ...expectedArgs
  ) {
    if (typeof received !== "function" || !received.mock) {
      return { pass: false, message: () => "Expected a mock function" };
    }
    const { calls, contexts } = received.mock;

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

  toHaveBeenCalledExactlyOnceWithThis(received, expectedThis, ...expectedArgs) {
    if (typeof received !== "function" || !received.mock) {
      return { pass: false, message: () => "Expected a mock function" };
    }

    const { calls, contexts } = received.mock;

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
          calls
            .map((call, index) => {
              return (
                `  Call ${index + 1}:\n` +
                `    Context: ${inspect(contexts[index])}\n` +
                `    Args: ${inspect(call)}`
              );
            })
            .join("\n"),
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
