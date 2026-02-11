// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * General-purpose sandboxed JavaScript code executor.
 * Uses Node's vm module to run code with timeout and a controlled execution scope.
 */

import vm from "node:vm";
import { CODE_EXEC_TIMEOUT_MS } from "#src/tools/clip/code-exec/code-exec-types.ts";
import type { SandboxResult } from "#src/tools/clip/code-exec/code-exec-types.ts";

/**
 * Safe builtins exposed to user code.
 * Excludes: require, process, global, fetch, setTimeout, setInterval, Buffer, etc.
 */
const SAFE_GLOBALS = {
  Math,
  Array,
  Object,
  Number,
  String,
  Boolean,
  JSON,
  Date,
  Map,
  Set,
  parseInt: Number.parseInt,
  parseFloat: Number.parseFloat,
  isNaN: Number.isNaN,
  isFinite: Number.isFinite,
  undefined,
  NaN: Number.NaN,
  Infinity,
};

/**
 * Execute JavaScript code in a sandboxed VM context.
 *
 * @param code - JavaScript code to execute (pre-wrapped by caller)
 * @param globals - Named values to inject into the sandbox scope
 * @param timeoutMs - Timeout in milliseconds (default: CODE_EXEC_TIMEOUT_MS)
 * @returns Raw result or error
 */
export function executeSandboxedCode(
  code: string,
  globals: Record<string, unknown> = {},
  timeoutMs: number = CODE_EXEC_TIMEOUT_MS,
): SandboxResult {
  // Defense-in-depth: reject execution if code exec is not enabled at build time
  if (process.env.ENABLE_CODE_EXEC !== "true") {
    return { success: false, error: "Code execution is not enabled" };
  }

  // Create sandbox with safe globals and deep-copied user globals
  const sandbox: Record<string, unknown> = { ...SAFE_GLOBALS };

  for (const [key, value] of Object.entries(globals)) {
    sandbox[key] = structuredClone(value);
  }

  const vmContext = vm.createContext(sandbox);

  let result: unknown;

  try {
    result = vm.runInContext(code, vmContext, {
      timeout: timeoutMs,
      displayErrors: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("Script execution timed out")) {
      return {
        success: false,
        error: `Code execution timed out after ${timeoutMs}ms`,
      };
    }

    return { success: false, error: `Code execution error: ${message}` };
  }

  return { success: true, result };
}
