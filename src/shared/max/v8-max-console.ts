// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Enhance Max v8's basic console logging functions (`post()` and `error()`) to behave more like a browser console
// Note: this is for Max v8 runtime only, meaning is can be used with src/live-api-adapter and src/tools code.
// There are dedicated logging solutions for the Claude Desktop Extension and MCP Server (Node for Max) code
// in the respective source code folders.

import { recordWarning } from "./v8-warning-capture.ts";

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
    // Declared so the fallback below can call it: whether it's Object's
    // default (the "[object Object]" case) is what that line tests for.
    toString: () => string;
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
  // Max V8's global error() is only ambiently typed under src/tsconfig (via
  // src/types/max-globals.d.ts). Self-type the access here so this module also
  // typechecks when pulled into graphs that don't include src/types (e.g. the
  // e2e/mcp tsconfig). Falls back to Node's console.error outside Max.
  //
  // Max V8 does put its globals on globalThis (verified in Live). That is
  // load-bearing: a warning raised with no request in flight reaches the user
  // only through this call.
  const maxError = (globalThis as { error?: (...args: unknown[]) => void })
    .error;

  if (typeof maxError === "function") {
    maxError(...args.map(str), "\n");
  } else {
    // Fallback for test environment
    console.error(...args.map(str));
  }
};

/**
 * Log a warning for the AI to read in the tool result.
 *
 * The in-flight request buffers it and appends it to its own response, so a
 * warning can't land on an unrelated one. With no request in flight there is no
 * response to append to, so it goes to the Max console — the user can act on it,
 * and no other request's result gets polluted.
 *
 * Outlet 1 still carries every warning, as a debug stream nothing in the patch
 * is wired to — hang a print on it when you need to watch warnings live.
 *
 * @param args - Values to log as warnings
 */
export const warn = (...args: unknown[]): void => {
  const parts = args.map(str);
  const message = parts.join(" ");
  const captured = recordWarning(message);

  if (typeof outlet === "function") {
    outlet(1, message);
  } else if (
    typeof console !== "undefined" &&
    typeof console.warn === "function"
  ) {
    console.warn(...parts);
  }

  if (!captured) {
    error(message);
  }
};
