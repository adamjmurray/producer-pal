// src/expect-extensions.js
import { expect } from "vitest";

expect.extend({
  toHaveBeenCalledWithThis(received, expectedThis, ...expectedArgs) {
    if (typeof received !== "function" || !received.mock) {
      return { pass: false, message: () => "Expected a mock function" };
    }
    const { calls, contexts } = received.mock;
    if (calls.length === 0 || contexts.length === 0) {
      return { pass: false, message: () => "Expected mock function to have been called" };
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
          `  Context: ${JSON.stringify(expectedThis, null, 2)}\n` +
          `  Args: ${JSON.stringify(expectedArgs, null, 2)}`,
      };
    }
    return {
      pass: false,
      message: () => {
        return (
          `Expected mock function to have been called with:\n` +
          `  Context: ${JSON.stringify(expectedThis, null, 2)}\n` +
          `  Args: ${JSON.stringify(expectedArgs, null, 2)}\n\n` +
          `But it was called with:\n` +
          calls
            .map((call, index) => {
              return (
                `  Call ${index + 1}:\n` +
                `    Context: ${JSON.stringify(contexts[index], null, 2)}\n` +
                `    Args: ${JSON.stringify(call, null, 2)}`
              );
            })
            .join("\n")
        );
      },
    };
  },
});
