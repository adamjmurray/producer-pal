/**
 * Parse boolean input from Max for Live
 *
 * Max sends polymorphic input types: "1", true, [1], 1, "true", etc.
 * This helper normalizes all truthy Max inputs to a boolean.
 *
 * @param {unknown} input - Input value from Max
 * @returns {boolean} Normalized boolean value
 */
// eslint-disable-next-line eqeqeq -- intentional loose equality to handle Max's polymorphic input types
export const parseMaxBoolean = (input) => input == 1 || input === "true";
