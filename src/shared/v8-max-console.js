// Enhance Max v8's basic console logging functions (`post()` and `error()`) to behave more like a browser console
// Note: this is for Max v8 runtime only, meaning is can be used with src/live-api-adapter and src/tools code.
// There are dedicated logging solutions for the Claude Desktop Extension and MCP Server (Node for Max) code
// in the respective source code folders.

/**
 * Convert any value to a human-readable string representation
 * @param {unknown} value - Value to stringify
 * @returns {string} String representation
 */
const str = (value) => {
  const val = /** @type {any} */ (value);

  switch (Object.getPrototypeOf(val ?? Object.prototype)) {
    case Array.prototype:
      return `[${val.map(str).join(", ")}]`;

    case Set.prototype:
      return `Set(${[...val].map(str).join(", ")})`;

    case Object.prototype:
      return `{${Object.entries(val)
        .map(([k, v]) => `${str(k)}: ${str(v)}`)
        .join(", ")}}`;

    case Map.prototype: {
      /** @type {string} */
      const entries = [...val.entries()]
        .map(
          (/** @type {[unknown, unknown]} */ [k, v]) => `${str(k)} → ${str(v)}`,
        )
        .join(", ");

      return `Map(${entries})`;
    }

    case typeof Dict !== "undefined" ? Dict.prototype : null:
      return `Dict("${val.name}") ${val.stringify().replaceAll("\n", " ")}`;
  }

  const s = String(val);

  return s === "[object Object]"
    ? val.constructor.name + JSON.stringify(val)
    : s;
};

/**
 * Log values to Max console (or Node console as fallback)
 * @param {...unknown} args - Values to log
 */
export const log = (...args) => {
  if (typeof post === "function") {
    post(...args.map(str), "\n");
  } else {
    // Fallback for test environment
    console.log(...args.map(str));
  }
};

/**
 * Log error values to Max console (or Node console as fallback)
 * @param {...unknown} args - Values to log as errors
 */
export const error = (...args) => {
  if (typeof globalThis.error === "function") {
    globalThis.error(...args.map(str), "\n");
  } else {
    // Fallback for test environment
    console.error(...args.map(str));
  }
};

// Max has no concept of a warning, and we use console.error()
// to emit warnings for our MCP tools anyway (we throw errors
// for fatal errors), so alias console.warn to Max error()
// TODO: prefer use of this for emitting warnings moving forward.
export const warn = error;
