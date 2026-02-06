// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CodeExecutionContext,
  CodeNote,
  NotesDataMessage,
} from "#src/tools/clip/code-exec/code-exec-types.ts";
import {
  completeCodeExecRequest,
  handleNotesData,
  isCodeExecRequest,
  registerCodeExecRequest,
} from "./code-exec-protocol.ts";

// Test factories to reduce duplication
const mockNote = (overrides?: Partial<CodeNote>): CodeNote => ({
  pitch: 60,
  start: 0,
  duration: 1,
  velocity: 100,
  velocityDeviation: 0,
  probability: 1,
  ...overrides,
});

const mockContext = (): CodeExecutionContext => ({
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

const mockNotesData = (
  requestId: string,
  clips: NotesDataMessage["clips"],
): NotesDataMessage => ({
  requestId,
  clips,
  context: mockContext(),
});

type SentData = { clips: Array<{ notes: CodeNote[] }> };

const parseSentData = (): SentData => {
  const sentJson = vi.mocked(Max.outlet).mock.calls[0]?.[2] as
    | string
    | undefined;

  expect(sentJson).toBeDefined();

  return JSON.parse(sentJson as string) as SentData;
};

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

      registerCodeExecRequest(
        "req-exec",
        "return notes.map(n => ({ ...n, pitch: n.pitch + 12 }));",
        resolve,
      );

      const notesData = mockNotesData("req-exec", [
        { clipId: "clip-1", notes: [mockNote()] },
      ]);

      await handleNotesData("req-exec", JSON.stringify(notesData));

      expect(vi.mocked(Max.outlet)).toHaveBeenCalledWith(
        "apply_notes",
        "req-exec",
        expect.any(String),
      );

      expect(parseSentData().clips[0]?.notes[0]?.pitch).toBe(72); // 60 + 12
    });

    it("should use original notes on code error", async () => {
      const resolve = vi.fn();

      registerCodeExecRequest(
        "req-error",
        'throw new Error("test error");',
        resolve,
      );

      const notesData = mockNotesData("req-error", [
        { clipId: "clip-1", notes: [mockNote()] },
      ]);

      await handleNotesData("req-error", JSON.stringify(notesData));

      // Should still send apply_notes with original notes
      expect(vi.mocked(Max.outlet)).toHaveBeenCalled();
      expect(parseSentData().clips[0]?.notes[0]?.pitch).toBe(60); // Original pitch
    });

    it("should handle invalid JSON by sending back raw data", async () => {
      registerCodeExecRequest("req-json", "return notes;", vi.fn());

      await handleNotesData("req-json", "invalid json {");

      // Should send apply_notes with the original invalid JSON
      expect(vi.mocked(Max.outlet)).toHaveBeenCalledWith(
        "apply_notes",
        "req-json",
        "invalid json {",
      );
    });

    it("should handle multiple clips", async () => {
      registerCodeExecRequest(
        "req-multi",
        "return notes.filter(n => n.pitch >= 64);",
        vi.fn(),
      );

      const notesData = mockNotesData("req-multi", [
        { clipId: "clip-1", notes: [mockNote({ pitch: 60 })] },
        {
          clipId: "clip-2",
          notes: [mockNote({ pitch: 64 }), mockNote({ pitch: 67, start: 1 })],
        },
      ]);

      await handleNotesData("req-multi", JSON.stringify(notesData));

      const sentData = parseSentData();

      // First clip filtered out (pitch 60 < 64)
      expect(sentData.clips[0]?.notes).toHaveLength(0);
      // Second clip keeps both notes (64 and 67 >= 64)
      expect(sentData.clips[1]?.notes).toHaveLength(2);
    });
  });
});
