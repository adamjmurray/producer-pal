// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { executeSandboxedCode } from "./code-executor.ts";

describe("code-executor", () => {
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

      expect(result.success).toBe(false);
      expect(!result.success && result.error).toContain("Code execution error");
    });

    it("should return error on timeout", () => {
      const result = executeSandboxedCode("while(true) {}", {}, 10);

      expect(result.success).toBe(false);
      expect(!result.success && result.error).toContain("timed out");
    });

    it("should return error for runtime exceptions", () => {
      const result = executeSandboxedCode('throw new Error("test error")');

      expect(result.success).toBe(false);
      expect(!result.success && result.error).toContain("test error");
    });

    it("should return undefined result for no return value", () => {
      const result = executeSandboxedCode("const x = 1;");

      expect(result.success).toBe(true);
      expect(result).toStrictEqual({ success: true, result: undefined });
    });
  });

  describe("sandbox security", () => {
    it("should not expose require", () => {
      const result = executeSandboxedCode("typeof require");

      expect(result).toStrictEqual({ success: true, result: "undefined" });
    });

    it("should not expose process", () => {
      const result = executeSandboxedCode("typeof process");

      expect(result).toStrictEqual({ success: true, result: "undefined" });
    });

    it("should not expose global", () => {
      const result = executeSandboxedCode("typeof global");

      expect(result).toStrictEqual({ success: true, result: "undefined" });
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
