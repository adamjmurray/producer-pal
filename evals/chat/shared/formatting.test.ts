// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for formatting.ts
 */
import { describe, it, expect, vi } from "vitest";
import {
  truncate,
  formatToolCall,
  formatToolResult,
  startThought,
  continueThought,
  endThought,
  formatThought,
  DEBUG_SEPARATOR,
  debugLog,
  debugCall,
  formatScenarioHeader,
  formatTurnHeader,
  formatSectionHeader,
  formatSubsectionHeader,
} from "./formatting.ts";

describe("truncate", () => {
  it("returns empty string for undefined input", () => {
    expect(truncate(undefined, 10)).toBe("");
  });

  it("returns empty string for empty string input", () => {
    expect(truncate("", 10)).toBe("");
  });

  it("returns full string when shorter than max length", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns full string when exactly at max length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates string longer than max length with default suffix", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  it("truncates with custom suffix", () => {
    expect(truncate("hello world", 8, "...")).toBe("hello...");
  });

  it("handles max length shorter than suffix", () => {
    expect(truncate("hello world", 2)).toBe("h…");
  });

  it("handles max length of 1", () => {
    expect(truncate("hello", 1)).toBe("…");
  });

  it("handles max length of 0", () => {
    expect(truncate("hello", 0)).toBe("…");
  });
});

describe("formatToolCall", () => {
  it("formats tool call with simple args", () => {
    const result = formatToolCall("read-track", { trackId: "1" });

    expect(result).toContain("🔧 read-track");
    expect(result).toContain("trackId");
    expect(result).toContain("1");
  });

  it("formats tool call with empty args", () => {
    const result = formatToolCall("ppal-connect", {});

    expect(result).toContain("🔧 ppal-connect");
    expect(result).toContain("{}");
  });

  it("formats tool call with multiple args", () => {
    const result = formatToolCall("update-clip", {
      clipId: "5",
      name: "New Name",
      muted: true,
    });

    expect(result).toContain("🔧 update-clip");
    expect(result).toContain("clipId");
    expect(result).toContain("name");
    expect(result).toContain("muted");
  });

  it("formats tool call with nested args", () => {
    const result = formatToolCall("complex-tool", {
      options: { nested: { value: 42 } },
    });

    expect(result).toContain("🔧 complex-tool");
    expect(result).toContain("nested");
    expect(result).toContain("42");
  });
});

describe("formatToolResult", () => {
  it("formats tool result with arrow prefix and trailing newline", () => {
    const result = formatToolResult("Success");

    expect(result).toBe("   ↳ Success\n");
  });

  it("truncates long results", () => {
    const longResult = "x".repeat(200);
    const result = formatToolResult(longResult);

    expect(result).toContain("   ↳ ");
    expect(result.length).toBeLessThan(200);
    expect(result).toContain("…");
    expect(result).toMatch(/\n$/);
  });

  it("handles undefined result", () => {
    const result = formatToolResult(undefined);

    expect(result).toBe("   ↳ \n");
  });

  it("handles empty result", () => {
    const result = formatToolResult("");

    expect(result).toBe("   ↳ \n");
  });
});

describe("thought formatting", () => {
  describe("startThought", () => {
    it("includes THOUGHT marker", () => {
      const result = startThought("thinking...");

      expect(result).toContain("<THOUGHT>");
    });

    it("includes the thought text", () => {
      const result = startThought("analyzing the problem");

      expect(result).toContain("analyzing the problem");
    });

    it("uses box drawing characters for header", () => {
      const result = startThought("test");

      expect(result).toContain("╔");
      expect(result).toContain("═");
    });
  });

  describe("continueThought", () => {
    it("returns raw text", () => {
      const result = continueThought("single line");

      expect(result).toBe("single line");
    });

    it("preserves multiline text", () => {
      const result = continueThought("line1\nline2\nline3");

      expect(result).toBe("line1\nline2\nline3");
    });

    it("handles object input by stringifying", () => {
      const result = continueThought({ key: "value" });

      expect(result).toContain("key");
      expect(result).toContain("value");
    });
  });

  describe("endThought", () => {
    it("includes end_thought marker", () => {
      const result = endThought();

      expect(result).toContain("<end_thought>");
    });

    it("uses closing box character", () => {
      const result = endThought();

      expect(result).toContain("╚");
    });
  });

  describe("formatThought", () => {
    it("combines start and end", () => {
      const result = formatThought("complete thought");

      expect(result).toContain("<THOUGHT>");
      expect(result).toContain("<end_thought>");
      expect(result).toContain("complete thought");
    });
  });
});

describe("DEBUG_SEPARATOR", () => {
  it("is a line of dashes", () => {
    expect(DEBUG_SEPARATOR).toContain("-".repeat(80));
  });

  it("starts with newline", () => {
    expect(DEBUG_SEPARATOR.startsWith("\n")).toBe(true);
  });
});

describe("debugLog", () => {
  it("logs object with stripped verbose fields", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    debugLog({ name: "test", tools: [1, 2, 3], input: ["a", "b"] });

    expect(consoleSpy).toHaveBeenCalled();
    const loggedOutput = String(consoleSpy.mock.calls[0]?.[0] ?? "");

    expect(loggedOutput).toContain("name");
    expect(loggedOutput).toContain("test");
    expect(loggedOutput).toContain("[3 items]"); // tools abbreviated
    expect(loggedOutput).toContain("[2 items]"); // input abbreviated

    consoleSpy.mockRestore();
  });

  it("handles null input", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    debugLog(null);

    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("handles primitive input", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    debugLog("simple string");

    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe("debugCall", () => {
  it("logs function name and args", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    debugCall("myFunction", { arg1: "value1" });

    expect(consoleSpy).toHaveBeenCalled();
    const loggedOutput = String(consoleSpy.mock.calls[0]?.[0] ?? "");

    expect(loggedOutput).toContain("myFunction");
    expect(loggedOutput).toContain("arg1");
    expect(loggedOutput).toContain("value1");

    consoleSpy.mockRestore();
  });
});

describe("eval output formatting", () => {
  describe("formatScenarioHeader", () => {
    it("includes scenario id", () => {
      const result = formatScenarioHeader(
        "test-scenario",
        "Test description",
        "anthropic",
        "claude-sonnet",
      );

      expect(result).toContain("SCENARIO: test-scenario");
    });

    it("includes description", () => {
      const result = formatScenarioHeader(
        "test-scenario",
        "Test description",
        "anthropic",
        "claude-sonnet",
      );

      expect(result).toContain("Description: Test description");
    });

    it("includes provider and model", () => {
      const result = formatScenarioHeader(
        "test-scenario",
        "Test description",
        "anthropic",
        "claude-sonnet",
      );

      expect(result).toContain("Provider: anthropic");
      expect(result).toContain("Model: claude-sonnet");
    });

    it("uses box formatting with separators", () => {
      const result = formatScenarioHeader(
        "test-scenario",
        "Test description",
        "anthropic",
        "claude-sonnet",
      );

      expect(result).toContain("=".repeat(60));
      expect(result).toContain("|");
    });
  });

  describe("formatTurnHeader", () => {
    it("includes turn number", () => {
      const result = formatTurnHeader(1);

      expect(result).toContain("TURN 1");
    });

    it("includes separator line", () => {
      const result = formatTurnHeader(1);

      expect(result).toContain("-".repeat(60));
    });

    it("handles multi-digit turn numbers", () => {
      const result = formatTurnHeader(10);

      expect(result).toContain("TURN 10");
    });
  });

  describe("formatSectionHeader", () => {
    it("includes title", () => {
      const result = formatSectionHeader("EVALUATION");

      expect(result).toContain("EVALUATION");
    });

    it("uses major separator", () => {
      const result = formatSectionHeader("EVALUATION");

      expect(result).toContain("=".repeat(60));
    });
  });

  describe("formatSubsectionHeader", () => {
    it("includes title", () => {
      const result = formatSubsectionHeader("Correctness Checks");

      expect(result).toContain("Correctness Checks");
    });

    it("uses minor separator", () => {
      const result = formatSubsectionHeader("Correctness Checks");

      expect(result).toContain("-".repeat(60));
    });
  });
});
