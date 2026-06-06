// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type SandboxResult } from "#src/tools/clip/code-exec/code-exec-types.ts";
import { executeSandboxedCode } from "../code-executor.ts";

/**
 * Assert that a sandbox result is a failure and narrow the type.
 *
 * @param result - The sandbox result to check
 */
function expectFailure(
  result: SandboxResult,
): asserts result is { success: false; error: string } {
  expect(result.success).toBe(false);
}

describe("code-executor", () => {
  const originalEnv = process.env.ENABLE_CODE_EXEC;

  beforeEach(() => {
    process.env.ENABLE_CODE_EXEC = "true";
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENABLE_CODE_EXEC;
    } else {
      process.env.ENABLE_CODE_EXEC = originalEnv;
    }
  });

  describe("defense-in-depth guard", () => {
    it("should reject execution when ENABLE_CODE_EXEC is not set", () => {
      delete process.env.ENABLE_CODE_EXEC;

      const result = executeSandboxedCode("1 + 1");

      expectFailure(result);
      expect(result.error).toContain("not enabled");
    });

    it("should reject execution when ENABLE_CODE_EXEC is not 'true'", () => {
      process.env.ENABLE_CODE_EXEC = "false";

      const result = executeSandboxedCode("1 + 1");

      expectFailure(result);
      expect(result.error).toContain("not enabled");
    });
  });

  describe("basic execution", () => {
    it("should execute code and return result", () => {
      const result = executeSandboxedCode("1 + 2");

      expect(result.success).toBe(true);
      expect(result).toStrictEqual({ success: true, result: 3 });
    });

    it("should inject globals into sandbox scope", () => {
      const result = executeSandboxedCode("x + y", { x: 10, y: 20 });

      expect(result.success).toBe(true);
      expect(result).toStrictEqual({ success: true, result: 30 });
    });

    it("should support complex globals like arrays and objects", () => {
      const notes = [{ pitch: 60 }, { pitch: 72 }];
      const result = executeSandboxedCode("notes.map(n => n.pitch)", { notes });

      expect(result.success).toBe(true);
      expect(result).toStrictEqual({ success: true, result: [60, 72] });
    });

    it("should deep-clone globals to prevent mutation", () => {
      const data = { value: 1 };

      executeSandboxedCode("data.value = 999", { data });

      expect(data.value).toBe(1);
    });

    it("should support wrapped function code", () => {
      const code =
        "(function(notes, context) { return notes.length; })(notes, context)";
      const result = executeSandboxedCode(code, {
        notes: [1, 2, 3],
        context: { tempo: 120 },
      });

      expect(result.success).toBe(true);
      expect(result).toStrictEqual({ success: true, result: 3 });
    });
  });

  describe("error handling", () => {
    it("should return error for syntax errors", () => {
      const result = executeSandboxedCode("return notes.map(n => {");

      expectFailure(result);
      expect(result.error).toContain("Code execution error");
    });

    it("should return error on timeout", () => {
      const result = executeSandboxedCode("while(true) {}", {}, 10);

      expectFailure(result);
      expect(result.error).toContain("timed out");
    });

    it("should return error for runtime exceptions", () => {
      const result = executeSandboxedCode('throw new Error("test error")');

      expectFailure(result);
      expect(result.error).toContain("test error");
    });

    it("should handle non-Error thrown values", () => {
      const result = executeSandboxedCode('throw "string error"');

      expectFailure(result);
      expect(result.error).toContain("string error");
    });

    it("should return undefined result for no return value", () => {
      const result = executeSandboxedCode("const x = 1;");

      expect(result.success).toBe(true);
      expect(result).toStrictEqual({ success: true, result: undefined });
    });
  });

  // These assert the *default execution scope* is small — an ergonomic boundary
  // that keeps honest user code from reaching host built-ins — NOT a security
  // boundary. node:vm is not a sandbox; the escape test below documents that
  // code can still climb back out to the host realm. The real control is the
  // ENABLE_CODE_EXEC build gate + this being a dev/eval-only feature.
  describe("default execution scope (not a security boundary)", () => {
    it("does not put require in the default scope", () => {
      const result = executeSandboxedCode("typeof require");

      expect(result).toStrictEqual({ success: true, result: "undefined" });
    });

    it("does not put process in the default scope", () => {
      const result = executeSandboxedCode("typeof process");

      expect(result).toStrictEqual({ success: true, result: "undefined" });
    });

    it("does not put global in the default scope", () => {
      const result = executeSandboxedCode("typeof global");

      expect(result).toStrictEqual({ success: true, result: "undefined" });
    });

    it("is NOT a security sandbox: code can reach the host realm out of scope", () => {
      // node:vm is explicitly not a security mechanism. The injected built-ins
      // (Object, etc.) belong to the host realm, so `Object.constructor` is the
      // host Function constructor and `Function("return process")()` returns the
      // real process — even though bare `process` is absent from the scope above.
      // Asserted on purpose so nobody mistakes the limited scope for containment.
      const escaped = executeSandboxedCode(
        'typeof Object.constructor("return process")()',
      );

      expect(escaped).toStrictEqual({ success: true, result: "object" });

      const hostVersion = executeSandboxedCode(
        'typeof Object.constructor("return process")().version',
      );

      expect(hostVersion).toStrictEqual({ success: true, result: "string" });
    });

    it("should provide Math functions", () => {
      const result = executeSandboxedCode("Math.round(60.5)");

      expect(result).toStrictEqual({ success: true, result: 61 });
    });

    it("should provide Array methods", () => {
      const result = executeSandboxedCode(
        "items.filter(x => x > 2).map(x => x * 10)",
        { items: [1, 2, 3, 4] },
      );

      expect(result).toStrictEqual({ success: true, result: [30, 40] });
    });

    it("should provide JSON methods", () => {
      const result = executeSandboxedCode("JSON.parse('{\"a\":1}').a");

      expect(result).toStrictEqual({ success: true, result: 1 });
    });
  });
});
