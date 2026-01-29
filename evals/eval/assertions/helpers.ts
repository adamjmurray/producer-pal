/**
 * Shared utilities for assertion evaluation
 */

/**
 * Check if actual object contains all keys/values from expected (partial match)
 *
 * @param actual - The actual value to check
 * @param expected - The expected partial object
 * @returns True if actual contains all expected keys with matching values
 */
export function partialMatch(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];

    if (expectedValue === undefined) {
      continue;
    }

    if (!valuesMatch(actualValue, expectedValue)) {
      return false;
    }
  }

  return true;
}

/**
 * Type guard to check if a value is an asymmetric matcher (vitest/jest)
 *
 * @param value - The value to check
 * @returns True if value has asymmetricMatch method
 */
function isAsymmetricMatcher(
  value: unknown,
): value is { asymmetricMatch: (other: unknown) => boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    "asymmetricMatch" in value &&
    typeof (value as Record<string, unknown>).asymmetricMatch === "function"
  );
}

/**
 * Check if actual object exactly matches expected (no extra keys allowed)
 *
 * @param actual - The actual value to check
 * @param expected - The expected object (or asymmetric matcher like expect.objectContaining)
 * @returns True if actual has same keys as expected with matching values
 */
export function exactMatch(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): boolean {
  // Handle asymmetric matchers at the top level (e.g., expect.objectContaining)
  if (isAsymmetricMatcher(expected)) {
    return expected.asymmetricMatch(actual);
  }

  const actualKeys = Object.keys(actual);
  const expectedKeys = Object.keys(expected).filter(
    (k) => expected[k] !== undefined,
  );

  if (actualKeys.length !== expectedKeys.length) {
    return false;
  }

  return partialMatch(actual, expected);
}

/**
 * Recursively compare two values for equality
 *
 * @param actual - The actual value
 * @param expected - The expected value
 * @returns True if values match
 */
function valuesMatch(actual: unknown, expected: unknown): boolean {
  // Handle asymmetric matchers (vitest/jest)
  if (isAsymmetricMatcher(expected)) {
    return expected.asymmetricMatch(actual);
  }

  // Handle arrays - compare length and elements
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (actual.length !== expected.length) {
      return false;
    }

    return expected.every((val, i) => valuesMatch(actual[i], val));
  }

  // Handle objects (non-array) - recursive partial match
  if (
    typeof expected === "object" &&
    expected !== null &&
    typeof actual === "object" &&
    actual !== null &&
    !Array.isArray(expected) &&
    !Array.isArray(actual)
  ) {
    return partialMatch(
      actual as Record<string, unknown>,
      expected as Record<string, unknown>,
    );
  }

  // Primitives - direct comparison
  return actual === expected;
}

/**
 * Normalize count specification to min/max range
 *
 * @param count - Count spec (number, range, or undefined)
 * @returns Normalized range with min and optional max
 */
export function normalizeCount(
  count: number | { min?: number; max?: number } | undefined,
): { min: number; max?: number } {
  if (count == null) {
    return { min: 1 };
  }

  if (typeof count === "number") {
    return { min: count, max: count };
  }

  return { min: count.min ?? 1, max: count.max };
}

/**
 * Format expected count for error messages
 *
 * @param expected - Normalized count range
 * @param expected.min - Minimum count
 * @param expected.max - Maximum count (optional)
 * @returns Human-readable string
 */
export function formatExpectedCount(expected: {
  min: number;
  max?: number;
}): string {
  if (expected.max == null) {
    return `at least ${expected.min} time(s)`;
  }

  if (expected.min === expected.max) {
    return `exactly ${expected.min} time(s)`;
  }

  return `${expected.min}-${expected.max} time(s)`;
}
