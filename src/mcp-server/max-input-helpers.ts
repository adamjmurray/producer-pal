/**
 * Parse boolean input from Max for Live
 *
 * Max sends polymorphic input types: "1", true, [1], 1, "true", etc.
 * This helper normalizes all truthy Max inputs to a boolean.
 *
 * @param input - Input value from Max
 * @returns Normalized boolean value
 */
export const parseMaxBoolean = (input: unknown): boolean =>
  Number(input) === 1 || input === "true";
