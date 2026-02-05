// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeExecutionContext } from "#src/tools/clip/code-exec/code-exec-types.ts";
import {
  completeCodeExecRequest,
  handleNotesData,
  isCodeExecRequest,
  registerCodeExecRequest,
} from "./code-exec-protocol.ts";

// max-api is already mocked globally in test-setup.ts

// Mock the logger to avoid console output
vi.mock(import("./node-for-max-logger.ts"), () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe("code-exec-protocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("registerCodeExecRequest", () => {
    it("should register a request and make it findable", () => {
      const resolve = vi.fn();

      registerCodeExecRequest("req-1", "return notes;", resolve);

      expect(isCodeExecRequest("req-1")).toBe(true);
    });

    it("should timeout and resolve with error after 30 seconds", async () => {
      const resolve = vi.fn();

      registerCodeExecRequest("req-timeout", "return notes;", resolve);

      // Fast-forward 30 seconds
      await vi.advanceTimersByTimeAsync(30_000);

      expect(resolve).toHaveBeenCalledWith({
        content: [{ type: "text", text: "Code execution flow timed out" }],
        isError: true,
      });
      expect(isCodeExecRequest("req-timeout")).toBe(false);
    });

    it("should not call resolve before timeout", async () => {
      const resolve = vi.fn();

      registerCodeExecRequest("req-wait", "return notes;", resolve);

      // Fast-forward 29 seconds
      await vi.advanceTimersByTimeAsync(29_000);

      expect(resolve).not.toHaveBeenCalled();
      expect(isCodeExecRequest("req-wait")).toBe(true);
    });
  });

  describe("isCodeExecRequest", () => {
    it("should return false for unknown request", () => {
      expect(isCodeExecRequest("unknown")).toBe(false);
    });
  });

  describe("completeCodeExecRequest", () => {
    it("should return state and clear request", () => {
      const resolve = vi.fn();

      registerCodeExecRequest("req-complete", "return notes;", resolve);

      const state = completeCodeExecRequest("req-complete");

      expect(state).toBeDefined();
      expect(state?.code).toBe("return notes;");
      expect(isCodeExecRequest("req-complete")).toBe(false);
    });

    it("should return undefined for unknown request", () => {
      const state = completeCodeExecRequest("unknown");

      expect(state).toBeUndefined();
    });

    it("should clear timeout when completing", async () => {
      const resolve = vi.fn();

      registerCodeExecRequest("req-clear", "return notes;", resolve);
      completeCodeExecRequest("req-clear");

      // Fast-forward past timeout
      await vi.advanceTimersByTimeAsync(30_000);

      // Resolve should not have been called from timeout
      expect(resolve).not.toHaveBeenCalled();
    });
  });

  describe("handleNotesData", () => {
    const createContext = (): CodeExecutionContext => ({
      track: { index: 0, name: "Test", type: "midi", color: null },
      clip: {
        id: "clip-1",
        name: "Test Clip",
        length: 4,
        timeSignature: "4/4",
        looping: true,
      },
      location: { view: "session", sceneIndex: 0 },
      liveSet: { tempo: 120, timeSignature: "4/4" },
      beatsPerBar: 4,
    });

    it("should ignore unknown request ID", async () => {
      const logger = await import("./node-for-max-logger.ts");

      await handleNotesData("unknown", "{}");

      // Should log error for unknown request
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("unknown request"),
      );
    });

    it("should execute code and send apply_notes", async () => {
      const resolve = vi.fn();
      const mockOutlet = vi.mocked(Max.outlet);

      registerCodeExecRequest(
        "req-exec",
        "return notes.map(n => ({ ...n, pitch: n.pitch + 12 }));",
        resolve,
      );

      const notesData = {
        requestId: "req-exec",
        clips: [
          {
            clipId: "clip-1",
            notes: [
              {
                pitch: 60,
                start: 0,
                duration: 1,
                velocity: 100,
                velocityDeviation: 0,
                probability: 1,
              },
            ],
          },
        ],
        context: createContext(),
      };

      await handleNotesData("req-exec", JSON.stringify(notesData));

      expect(mockOutlet).toHaveBeenCalledWith(
        "apply_notes",
        "req-exec",
        expect.any(String),
      );

      // Parse the sent message to verify transformation
      const sentJson = mockOutlet.mock.calls[0]?.[2] as string | undefined;

      expect(sentJson).toBeDefined();

      const sentData = JSON.parse(sentJson as string) as {
        clips: Array<{ notes: Array<{ pitch: number }> }>;
      };

      expect(sentData.clips[0]?.notes[0]?.pitch).toBe(72); // 60 + 12
    });

    it("should use original notes on code error", async () => {
      const resolve = vi.fn();
      const mockOutlet = vi.mocked(Max.outlet);

      registerCodeExecRequest(
        "req-error",
        'throw new Error("test error");',
        resolve,
      );

      const notesData = {
        requestId: "req-error",
        clips: [
          {
            clipId: "clip-1",
            notes: [
              {
                pitch: 60,
                start: 0,
                duration: 1,
                velocity: 100,
                velocityDeviation: 0,
                probability: 1,
              },
            ],
          },
        ],
        context: createContext(),
      };

      await handleNotesData("req-error", JSON.stringify(notesData));

      // Should still send apply_notes with original notes
      expect(mockOutlet).toHaveBeenCalled();

      const sentJson = mockOutlet.mock.calls[0]?.[2] as string | undefined;

      expect(sentJson).toBeDefined();

      const sentData = JSON.parse(sentJson as string) as {
        clips: Array<{ notes: Array<{ pitch: number }> }>;
      };

      expect(sentData.clips[0]?.notes[0]?.pitch).toBe(60); // Original pitch
    });

    it("should handle invalid JSON by sending back raw data", async () => {
      const resolve = vi.fn();
      const mockOutlet = vi.mocked(Max.outlet);

      registerCodeExecRequest("req-json", "return notes;", resolve);

      await handleNotesData("req-json", "invalid json {");

      // Should send apply_notes with the original invalid JSON
      expect(mockOutlet).toHaveBeenCalledWith(
        "apply_notes",
        "req-json",
        "invalid json {",
      );
    });

    it("should handle multiple clips", async () => {
      const resolve = vi.fn();
      const mockOutlet = vi.mocked(Max.outlet);

      registerCodeExecRequest(
        "req-multi",
        "return notes.filter(n => n.pitch >= 64);",
        resolve,
      );

      const notesData = {
        requestId: "req-multi",
        clips: [
          {
            clipId: "clip-1",
            notes: [
              {
                pitch: 60,
                start: 0,
                duration: 1,
                velocity: 100,
                velocityDeviation: 0,
                probability: 1,
              },
            ],
          },
          {
            clipId: "clip-2",
            notes: [
              {
                pitch: 64,
                start: 0,
                duration: 1,
                velocity: 100,
                velocityDeviation: 0,
                probability: 1,
              },
              {
                pitch: 67,
                start: 1,
                duration: 1,
                velocity: 100,
                velocityDeviation: 0,
                probability: 1,
              },
            ],
          },
        ],
        context: createContext(),
      };

      await handleNotesData("req-multi", JSON.stringify(notesData));

      const sentJson = mockOutlet.mock.calls[0]?.[2] as string | undefined;

      expect(sentJson).toBeDefined();

      const sentData = JSON.parse(sentJson as string) as {
        clips: Array<{ notes: Array<{ pitch: number }> }>;
      };

      // First clip filtered out (pitch 60 < 64)
      expect(sentData.clips[0]?.notes).toHaveLength(0);
      // Second clip keeps both notes (64 and 67 >= 64)
      expect(sentData.clips[1]?.notes).toHaveLength(2);
    });
  });
});
