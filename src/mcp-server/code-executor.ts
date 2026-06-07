// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * General-purpose JavaScript code executor for the dev/eval-only code-exec
 * feature.
 *
 * NOT A SECURITY SANDBOX. Code runs in a node:vm context seeded with a small
 * default global scope (DEFAULT_GLOBALS). That scope is an *ergonomic* boundary
 * — it keeps honest user code from reaching for host built-ins like
 * require/process — not a *containment* one. node:vm is explicitly not a
 * security mechanism: the injected built-ins belong to the host realm, so code
 * can climb back out (e.g. `Object.constructor("return process")()` returns the
 * real process). The actual control is that code-exec is gated behind the
 * ENABLE_CODE_EXEC build flag (checked below) and is never enabled in shipped
 * builds. code-executor.test.ts documents the escape so the limited scope isn't
 * mistaken for containment.
 */

import vm from "node:vm";
import {
  CODE_EXEC_TIMEOUT_MS,
  type SandboxResult,
} from "#src/tools/clip/code-exec/code-exec-types.ts";

/**
 * Built-ins seeded into the default execution scope — an ergonomic allow-list
 * of what honest user code commonly needs, NOT a security boundary. Leaving
 * require/process/global/fetch/setTimeout/setInterval/Buffer/etc. out of the
 * default scope does not prevent code from reaching them (see file header).
 */
const DEFAULT_GLOBALS = {
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
 * Execute JavaScript code in a node:vm context with a limited default global
 * scope. NOT a security sandbox — see the file header for the real model.
 *
 * @param code - JavaScript code to execute (pre-wrapped by caller)
 * @param globals - Named values to inject into the execution scope
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

  // Seed the execution scope with the default globals + deep-copied user globals
  const scope: Record<string, unknown> = { ...DEFAULT_GLOBALS };

  for (const [key, value] of Object.entries(globals)) {
    scope[key] = structuredClone(value);
  }

  const vmContext = vm.createContext(scope);

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
