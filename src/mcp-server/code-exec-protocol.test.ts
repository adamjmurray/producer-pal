// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCodeExecRequest } from "./code-exec-protocol.ts";

// max-api is already mocked globally in test-setup.ts

// Mock the logger to avoid console output
vi.mock(import("./node-for-max-logger.ts"), () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

/**
 * Parse the result JSON sent via Max.outlet
 *
 * @returns Parsed result object
 */
function parseSentResult(): {
  success: boolean;
  result?: unknown;
  error?: string;
} {
  const call = vi.mocked(Max.outlet).mock.calls[0];

  expect(call).toBeDefined();
  expect(call?.[0]).toBe("code_exec_result");

  const resultJson = call?.[2] as string;

  return JSON.parse(resultJson) as {
    success: boolean;
    result?: unknown;
    error?: string;
  };
}

describe("code-exec-protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute code and send result back", async () => {
    const request = JSON.stringify({
      code: "x + y",
      globals: { x: 10, y: 20 },
    });

    await handleCodeExecRequest("req-1", request);

    expect(vi.mocked(Max.outlet)).toHaveBeenCalledWith(
      "code_exec_result",
      "req-1",
      expect.any(String),
    );

    const result = parseSentResult();

    expect(result.success).toBe(true);
    expect(result.result).toBe(30);
  });

  it("should handle code execution errors", async () => {
    const request = JSON.stringify({
      code: 'throw new Error("test error")',
      globals: {},
    });

    await handleCodeExecRequest("req-2", request);

    const result = parseSentResult();

    expect(result.success).toBe(false);
    expect(result.error).toContain("test error");
  });

  it("should handle invalid JSON request", async () => {
    await handleCodeExecRequest("req-3", "invalid json {");

    const result = parseSentResult();

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to parse request");
  });

  it("should work without globals", async () => {
    const request = JSON.stringify({ code: "1 + 1" });

    await handleCodeExecRequest("req-4", request);

    const result = parseSentResult();

    expect(result.success).toBe(true);
    expect(result.result).toBe(2);
  });

  it("should log error when Max.outlet fails in sendCodeExecResult", async () => {
    const consoleMock = await import("./node-for-max-logger.ts");

    // Make Max.outlet reject to trigger the catch branch in sendCodeExecResult
    vi.mocked(Max.outlet).mockRejectedValueOnce(new Error("outlet failed"));

    const request = JSON.stringify({ code: "1 + 1" });

    await handleCodeExecRequest("req-err", request);

    expect(consoleMock.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to send code_exec_result"),
    );
    expect(consoleMock.error).toHaveBeenCalledWith(
      expect.stringContaining("req-err"),
    );
  });

  it("should execute wrapped function code like V8 sends", async () => {
    const userCode = "return notes.map(n => ({ ...n, pitch: n.pitch + 12 }))";
    const wrappedCode = `(function(notes, context) { ${userCode} })(notes, context)`;
    const notes = [{ pitch: 60, start: 0, duration: 1, velocity: 100 }];
    const context = { tempo: 120 };

    const request = JSON.stringify({
      code: wrappedCode,
      globals: { notes, context },
    });

    await handleCodeExecRequest("req-5", request);

    const result = parseSentResult();

    expect(result.success).toBe(true);

    const resultNotes = result.result as Array<{ pitch: number }>;

    expect(resultNotes).toHaveLength(1);
    expect(resultNotes[0]?.pitch).toBe(72);
  });
});
