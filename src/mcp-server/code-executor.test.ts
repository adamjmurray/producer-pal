// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type {
  CodeExecutionContext,
  CodeNote,
} from "#src/tools/clip/code-exec/code-exec-types.ts";
import { executeCode } from "./code-executor.ts";

const createTestContext = (): CodeExecutionContext => ({
  track: { index: 0, name: "Bass", type: "midi", color: "#FF5500" },
  clip: {
    id: "clip-123",
    name: "Bassline",
    length: 16,
    timeSignature: "4/4",
    looping: true,
  },
  location: { view: "session", sceneIndex: 0 },
  liveSet: { tempo: 120, scale: "C Minor", timeSignature: "4/4" },
  beatsPerBar: 4,
});

const createTestNote = (overrides: Partial<CodeNote> = {}): CodeNote => ({
  pitch: 60,
  start: 0,
  duration: 1,
  velocity: 100,
  velocityDeviation: 0,
  probability: 1,
  ...overrides,
});

/**
 * Assert result is successful and return notes
 * @param result - Code execution result
 * @returns Notes array
 */
function assertSuccess(result: ReturnType<typeof executeCode>): CodeNote[] {
  expect(result.success).toBe(true);

  // Type guard assertion
  if (!result.success) {
    throw new Error(`Expected success but got error: ${result.error}`);
  }

  return result.notes;
}

/**
 * Assert result is failure and return error message
 * @param result - Code execution result
 * @returns Error message
 */
function assertFailure(result: ReturnType<typeof executeCode>): string {
  expect(result.success).toBe(false);

  // Type guard assertion
  if (result.success) {
    throw new Error("Expected failure but got success");
  }

  return result.error;
}

describe("code-executor", () => {
  describe("basic execution", () => {
    it("should execute simple identity transform", () => {
      const notes = [createTestNote()];
      const result = executeCode("return notes;", notes, createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes).toHaveLength(1);
      expect(resultNotes[0]?.pitch).toBe(60);
    });

    it("should execute transpose transform", () => {
      const notes = [createTestNote({ pitch: 60 })];
      const code = `
        return notes.map(n => ({
          ...n,
          pitch: n.pitch + 12
        }));
      `;
      const result = executeCode(code, notes, createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes[0]?.pitch).toBe(72);
    });

    it("should execute filter transform", () => {
      const notes = [
        createTestNote({ pitch: 48 }),
        createTestNote({ pitch: 60 }),
        createTestNote({ pitch: 72 }),
      ];
      const code = "return notes.filter(n => n.pitch >= 60);";
      const result = executeCode(code, notes, createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes).toHaveLength(2);
    });

    it("should execute generate transform", () => {
      const code = `
        const result = [];
        for (let i = 0; i < 4; i++) {
          result.push({
            pitch: 60 + i * 4,
            start: i,
            duration: 0.5,
            velocity: 100,
            velocityDeviation: 0,
            probability: 1
          });
        }
        return result;
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes).toHaveLength(4);
      expect(resultNotes[0]?.pitch).toBe(60);
      expect(resultNotes[3]?.pitch).toBe(72);
    });

    it("should provide context to user code", () => {
      const code = `
        return [{
          pitch: 60,
          start: 0,
          duration: context.beatsPerBar,
          velocity: Math.round(context.liveSet.tempo),
          velocityDeviation: 0,
          probability: 1
        }];
      `;
      const ctx = createTestContext();
      const result = executeCode(code, [], ctx);
      const resultNotes = assertSuccess(result);

      expect(resultNotes[0]?.duration).toBe(4);
      expect(resultNotes[0]?.velocity).toBe(120);
    });
  });

  describe("error handling", () => {
    it("should return error for syntax errors", () => {
      const result = executeCode(
        "return notes.map(n => {",
        [],
        createTestContext(),
      );
      const errorMsg = assertFailure(result);

      expect(errorMsg).toContain("Code execution error");
    });

    it("should return error when code does not return array", () => {
      const result = executeCode(
        'return "not an array";',
        [],
        createTestContext(),
      );
      const errorMsg = assertFailure(result);

      expect(errorMsg).toContain("must return an array");
    });

    it("should return error when code returns undefined", () => {
      const result = executeCode("const x = 1;", [], createTestContext());
      const errorMsg = assertFailure(result);

      expect(errorMsg).toContain("must return an array");
    });

    it("should return error on timeout", () => {
      const code = "while(true) {} return [];";
      const result = executeCode(code, [], createTestContext(), 10);
      const errorMsg = assertFailure(result);

      expect(errorMsg).toContain("timed out");
    });

    it("should return error for runtime exceptions", () => {
      const code = 'throw new Error("test error");';
      const result = executeCode(code, [], createTestContext());
      const errorMsg = assertFailure(result);

      expect(errorMsg).toContain("test error");
    });
  });

  describe("note validation and sanitization", () => {
    it("should filter out notes missing required properties", () => {
      const code = `
        return [
          { pitch: 60 },  // missing start, duration, velocity
          { pitch: 60, start: 0, duration: 1, velocity: 100, velocityDeviation: 0, probability: 1 }
        ];
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes).toHaveLength(1);
    });

    it("should filter out notes with invalid duration", () => {
      const code = `
        return [
          { pitch: 60, start: 0, duration: 0, velocity: 100, velocityDeviation: 0, probability: 1 },
          { pitch: 60, start: 1, duration: -1, velocity: 100, velocityDeviation: 0, probability: 1 },
          { pitch: 60, start: 2, duration: 1, velocity: 100, velocityDeviation: 0, probability: 1 }
        ];
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes).toHaveLength(1);
      expect(resultNotes[0]?.start).toBe(2);
    });

    it("should clamp pitch to 0-127", () => {
      const code = `
        return [
          { pitch: -10, start: 0, duration: 1, velocity: 100, velocityDeviation: 0, probability: 1 },
          { pitch: 200, start: 1, duration: 1, velocity: 100, velocityDeviation: 0, probability: 1 }
        ];
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes[0]?.pitch).toBe(0);
      expect(resultNotes[1]?.pitch).toBe(127);
    });

    it("should clamp velocity to 1-127", () => {
      const code = `
        return [
          { pitch: 60, start: 0, duration: 1, velocity: 0, velocityDeviation: 0, probability: 1 },
          { pitch: 60, start: 1, duration: 1, velocity: 200, velocityDeviation: 0, probability: 1 }
        ];
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes[0]?.velocity).toBe(1);
      expect(resultNotes[1]?.velocity).toBe(127);
    });

    it("should clamp probability to 0-1", () => {
      const code = `
        return [
          { pitch: 60, start: 0, duration: 1, velocity: 100, velocityDeviation: 0, probability: -0.5 },
          { pitch: 60, start: 1, duration: 1, velocity: 100, velocityDeviation: 0, probability: 2 }
        ];
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes[0]?.probability).toBe(0);
      expect(resultNotes[1]?.probability).toBe(1);
    });

    it("should default optional properties", () => {
      const code = `
        return [
          { pitch: 60, start: 0, duration: 1, velocity: 100 }
        ];
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes[0]?.velocityDeviation).toBe(0);
      expect(resultNotes[0]?.probability).toBe(1);
    });

    it("should round pitch and velocity to integers", () => {
      const code = `
        return [
          { pitch: 60.7, start: 0, duration: 1, velocity: 100.3, velocityDeviation: 0, probability: 1 }
        ];
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes[0]?.pitch).toBe(61);
      expect(resultNotes[0]?.velocity).toBe(100);
    });
  });

  describe("sandbox security", () => {
    it("should not expose require", () => {
      const code = `
        try {
          const fs = require('fs');
          return [];
        } catch (e) {
          return [{ pitch: 60, start: 0, duration: 1, velocity: 100, velocityDeviation: 0, probability: 1 }];
        }
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      // If require was available, would return empty array
      // Since it's not, the catch block returns a note
      expect(resultNotes).toHaveLength(1);
    });

    it("should not expose process", () => {
      const code = `
        if (typeof process === 'undefined') {
          return [{ pitch: 60, start: 0, duration: 1, velocity: 100, velocityDeviation: 0, probability: 1 }];
        }
        return [];
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes).toHaveLength(1);
    });

    it("should not expose global", () => {
      const code = `
        if (typeof global === 'undefined') {
          return [{ pitch: 60, start: 0, duration: 1, velocity: 100, velocityDeviation: 0, probability: 1 }];
        }
        return [];
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes).toHaveLength(1);
    });

    it("should provide Math functions", () => {
      const code = `
        return [{
          pitch: Math.round(60.5),
          start: Math.floor(0.9),
          duration: Math.max(0.5, 1),
          velocity: Math.min(127, 150),
          velocityDeviation: 0,
          probability: 1
        }];
      `;
      const result = executeCode(code, [], createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes[0]?.pitch).toBe(61);
      expect(resultNotes[0]?.start).toBe(0);
      expect(resultNotes[0]?.duration).toBe(1);
      expect(resultNotes[0]?.velocity).toBe(127);
    });

    it("should provide Array methods", () => {
      const notes = [
        createTestNote({ pitch: 60 }),
        createTestNote({ pitch: 64 }),
        createTestNote({ pitch: 67 }),
      ];
      const code = `
        return notes
          .filter(n => n.pitch > 60)
          .map(n => ({ ...n, pitch: n.pitch + 12 }));
      `;
      const result = executeCode(code, notes, createTestContext());
      const resultNotes = assertSuccess(result);

      expect(resultNotes).toHaveLength(2);
      expect(resultNotes[0]?.pitch).toBe(76);
      expect(resultNotes[1]?.pitch).toBe(79);
    });

    it("should not allow mutation of original notes", () => {
      const notes = [createTestNote({ pitch: 60 })];
      const code = `
        notes[0].pitch = 100;
        return notes;
      `;

      executeCode(code, notes, createTestContext());

      // Original notes should be unchanged
      expect(notes[0]?.pitch).toBe(60);
    });

    it("should not allow mutation of context", () => {
      const ctx = createTestContext();
      const code = `
        try {
          context.liveSet.tempo = 200;
        } catch (e) {
          // Expected - context is frozen
        }
        return [];
      `;

      executeCode(code, [], ctx);

      // Original context should be unchanged
      expect(ctx.liveSet.tempo).toBe(120);
    });
  });
});
