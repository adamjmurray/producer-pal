// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

// Enhance Max v8's basic console logging functions (`post()` and `error()`) to behave more like a browser console
// Note: this is for Max v8 runtime only, meaning is can be used with src/live-api-adapter and src/tools code.
// There are dedicated logging solutions for the Claude Desktop Extension and MCP Server (Node for Max) code
// in the respective source code folders.

// Declare Max for Live global functions
declare function post(...args: unknown[]): void;
declare function outlet(outletNumber: number, ...args: unknown[]): void;
declare const Dict:
  | {
      prototype: object;
    }
  | undefined;

/**
 * Convert any value to a human-readable string representation
 * @param value - Value to stringify
 * @returns String representation
 */
const str = (value: unknown): string => {
  const val = value as {
    map?: (fn: (v: unknown) => string) => string[];
    entries?: () => Iterable<[unknown, unknown]>;
    name?: string;
    stringify?: () => string;
    constructor?: { name: string };
  };

  switch (Object.getPrototypeOf(value ?? Object.prototype)) {
    case Array.prototype:
      return `[${(val as unknown[]).map(str).join(", ")}]`;

    case Set.prototype:
      return `Set(${[...(val as Set<unknown>)].map(str).join(", ")})`;

    case Object.prototype:
      return `{${Object.entries(val as object)
        .map(([k, v]) => `${str(k)}: ${str(v)}`)
        .join(", ")}}`;

    case Map.prototype: {
      const entries = [...(val as Map<unknown, unknown>).entries()]
        .map(([k, v]) => `${str(k)} → ${str(v)}`)
        .join(", ");

      return `Map(${entries})`;
    }

    case typeof Dict !== "undefined" ? Dict.prototype : null:
      return `Dict("${val.name}") ${val.stringify?.().replaceAll("\n", " ")}`;
  }

  const s = String(val);

  return s === "[object Object]"
    ? (val.constructor?.name ?? "Object") + JSON.stringify(val)
    : s;
};

/**
 * Log values to Max console (or Node console as fallback)
 * @param args - Values to log
 */
export const log = (...args: unknown[]): void => {
  if (typeof post === "function") {
    post(...args.map(str), "\n");
  } else {
    // Fallback for test environment
    console.log(...args.map(str));
  }
};

/**
 * Log error values to Max console (or Node console as fallback)
 * @param args - Values to log as errors
 */
export const error = (...args: unknown[]): void => {
  if (typeof globalThis.error === "function") {
    (globalThis.error as (...a: unknown[]) => void)(...args.map(str), "\n");
  } else {
    // Fallback for test environment
    console.error(...args.map(str));
  }
};

/**
 * Log warning values to Max console and emit to outlet 1 for MCP capture.
 * Emits to outlet(1) to pass the warning string to the MCP response.
 * Falls back to console.warn when outlet is not available.
 * @param args - Values to log as warnings
 */
export const warn = (...args: unknown[]): void => {
  const parts = args.map(str);

  if (typeof outlet === "function") {
    outlet(1, parts.join(" "));
  } else if (
    typeof console !== "undefined" &&
    typeof console.warn === "function"
  ) {
    console.warn(...parts);
  }
};
