// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { applyAudioParams, applyMidiParams } from "./transform-clips-params.ts";
import type { MidiNote } from "./transform-clips-params.ts";

// Simple seeded RNG for deterministic tests
function createTestRng(sequence: number[] = [0.5]): () => number {
  let index = 0;

  return () => {
    const value = sequence[index % sequence.length] as number;

    index++;

    return value;
  };
}

interface MockClip {
  getProperty: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  call?: ReturnType<typeof vi.fn>;
}

describe("transform-clips-params", () => {
  describe("applyAudioParams", () => {
    it("does nothing when no params provided", () => {
      const clip: MockClip = {
        getProperty: vi.fn(),
        set: vi.fn(),
      };
      const rng = createTestRng();

      applyAudioParams(clip as unknown as LiveAPI, {}, rng);

      expect(clip.set).not.toHaveBeenCalled();
    });

    it("applies gain offset in dB space", () => {
      const clip: MockClip = {
        getProperty: vi.fn().mockReturnValue(1.0), // 0 dB
        set: vi.fn(),
      };
      const rng = createTestRng([0.5]);

      applyAudioParams(
        clip as unknown as LiveAPI,
        { gainDbMin: -6, gainDbMax: 6 },
        rng,
      );

      expect(clip.getProperty).toHaveBeenCalledWith("gain");
      expect(clip.set).toHaveBeenCalledWith("gain", expect.any(Number));
    });

    it("clamps gain to valid range (-70 to 24 dB)", () => {
      const clip: MockClip = {
        getProperty: vi.fn().mockReturnValue(1.0),
        set: vi.fn(),
      };
      // RNG returns 1.0 which will pick max value of 50
      const rng = createTestRng([1.0]);

      applyAudioParams(
        clip as unknown as LiveAPI,
        { gainDbMin: 40, gainDbMax: 50 },
        rng,
      );

      expect(clip.set).toHaveBeenCalledWith("gain", expect.any(Number));
    });

    it("applies transpose using discrete values array", () => {
      const clip: MockClip = {
        getProperty: vi.fn().mockReturnValue(0),
        set: vi.fn(),
      };
      const rng = createTestRng([0]); // Will pick first value

      applyAudioParams(
        clip as unknown as LiveAPI,
        { transposeValuesArray: [7, 12] },
        rng,
      );

      expect(clip.set).toHaveBeenCalledWith("pitch_coarse", 7);
      expect(clip.set).toHaveBeenCalledWith("pitch_fine", 0);
    });

    it("applies transpose using min/max range when no values array", () => {
      const clip: MockClip = {
        getProperty: vi.fn().mockReturnValue(0),
        set: vi.fn(),
      };
      const rng = createTestRng([0.5]); // Will pick middle of range

      applyAudioParams(
        clip as unknown as LiveAPI,
        { transposeMin: 0, transposeMax: 12 },
        rng,
      );

      expect(clip.set).toHaveBeenCalledWith("pitch_coarse", 6);
      expect(clip.set).toHaveBeenCalledWith("pitch_fine", 0);
    });

    it("handles fractional pitch correctly", () => {
      const clip: MockClip = {
        getProperty: vi.fn((prop: string) => {
          if (prop === "pitch_coarse") return 3;
          if (prop === "pitch_fine") return 50; // 0.5 semitones

          return 0;
        }),
        set: vi.fn(),
      };
      const rng = createTestRng([0.5]);

      applyAudioParams(
        clip as unknown as LiveAPI,
        { transposeMin: 0, transposeMax: 2 },
        rng,
      );

      // Current pitch is 3.5, offset is 1, new pitch is 4.5
      expect(clip.set).toHaveBeenCalledWith("pitch_coarse", 4);
      expect(clip.set).toHaveBeenCalledWith("pitch_fine", 50);
    });
  });

  describe("applyMidiParams", () => {
    function createMockMidiClip(notes: MidiNote[] = []): MockClip {
      return {
        getProperty: vi.fn().mockReturnValue(4), // 4 beats length
        set: vi.fn(),
        call: vi.fn((method: string) => {
          if (method === "get_notes_extended") {
            return JSON.stringify({ notes });
          }
        }),
      };
    }

    it("does nothing when clip has no notes", () => {
      const clip = createMockMidiClip([]);
      const rng = createTestRng();

      applyMidiParams(
        clip as unknown as LiveAPI,
        { velocityMin: -10, velocityMax: 10 },
        rng,
      );

      // Should call get_notes_extended but not apply_note_modifications
      expect(clip.call).toHaveBeenCalledTimes(1);
      expect(clip.call).toHaveBeenCalledWith(
        "get_notes_extended",
        0,
        128,
        0,
        4,
      );
    });

    it("applies velocity offset to notes", () => {
      const notes: MidiNote[] = [{ pitch: 60, velocity: 100, duration: 0.5 }];
      const clip = createMockMidiClip(notes);
      const rng = createTestRng([0.5]);

      applyMidiParams(
        clip as unknown as LiveAPI,
        { velocityMin: -20, velocityMax: 20 },
        rng,
      );

      expect(clip.call).toHaveBeenCalledWith(
        "apply_note_modifications",
        expect.stringContaining('"velocity":100'),
      );
    });

    it("applies transpose using values array", () => {
      const notes: MidiNote[] = [{ pitch: 60, velocity: 100, duration: 0.5 }];
      const clip = createMockMidiClip(notes);
      const rng = createTestRng([0]);

      applyMidiParams(
        clip as unknown as LiveAPI,
        { transposeValuesArray: [12] },
        rng,
      );

      expect(clip.call).toHaveBeenCalledWith(
        "apply_note_modifications",
        expect.stringContaining('"pitch":72'),
      );
    });

    it("applies transpose using min/max range", () => {
      const notes: MidiNote[] = [{ pitch: 60, velocity: 100, duration: 0.5 }];
      const clip = createMockMidiClip(notes);
      const rng = createTestRng([0.5]);

      applyMidiParams(
        clip as unknown as LiveAPI,
        { transposeMin: 0, transposeMax: 12 },
        rng,
      );

      expect(clip.call).toHaveBeenCalledWith(
        "apply_note_modifications",
        expect.stringContaining('"pitch":66'),
      );
    });

    it("clamps pitch to 0-127 range", () => {
      const notes: MidiNote[] = [{ pitch: 120, velocity: 100, duration: 0.5 }];
      const clip = createMockMidiClip(notes);
      const rng = createTestRng([1.0]);

      applyMidiParams(
        clip as unknown as LiveAPI,
        { transposeMin: 10, transposeMax: 20 },
        rng,
      );

      expect(clip.call).toHaveBeenCalledWith(
        "apply_note_modifications",
        expect.stringContaining('"pitch":127'),
      );
    });

    it("applies duration multiplier to notes", () => {
      const notes: MidiNote[] = [{ pitch: 60, velocity: 100, duration: 1.0 }];
      const clip = createMockMidiClip(notes);
      const rng = createTestRng([0.5]);

      applyMidiParams(
        clip as unknown as LiveAPI,
        { durationMin: 0.5, durationMax: 1.5 },
        rng,
      );

      expect(clip.call).toHaveBeenCalledWith(
        "apply_note_modifications",
        expect.stringContaining('"duration":1'),
      );
    });

    it("applies velocity deviation offset", () => {
      const notes: MidiNote[] = [{ pitch: 60, velocity: 100, duration: 0.5 }];
      const clip = createMockMidiClip(notes);
      const rng = createTestRng();

      applyMidiParams(clip as unknown as LiveAPI, { velocityRange: 20 }, rng);

      expect(clip.call).toHaveBeenCalledWith(
        "apply_note_modifications",
        expect.stringContaining('"velocity_deviation":20'),
      );
    });

    it("applies probability offset", () => {
      const notes: MidiNote[] = [{ pitch: 60, velocity: 100, duration: 0.5 }];
      const clip = createMockMidiClip(notes);
      const rng = createTestRng();

      applyMidiParams(clip as unknown as LiveAPI, { probability: -0.3 }, rng);

      expect(clip.call).toHaveBeenCalledWith(
        "apply_note_modifications",
        expect.stringContaining('"probability":0.7'),
      );
    });

    it("clamps velocity to 1-127 range", () => {
      const notes: MidiNote[] = [{ pitch: 60, velocity: 10, duration: 0.5 }];
      const clip = createMockMidiClip(notes);
      const rng = createTestRng([0]);

      applyMidiParams(
        clip as unknown as LiveAPI,
        { velocityMin: -50, velocityMax: -50 },
        rng,
      );

      expect(clip.call).toHaveBeenCalledWith(
        "apply_note_modifications",
        expect.stringContaining('"velocity":1'),
      );
    });

    it("clamps velocity deviation to -127 to 127", () => {
      const notes: MidiNote[] = [
        { pitch: 60, velocity: 100, duration: 0.5, velocity_deviation: 100 },
      ];
      const clip = createMockMidiClip(notes);
      const rng = createTestRng();

      applyMidiParams(clip as unknown as LiveAPI, { velocityRange: 50 }, rng);

      expect(clip.call).toHaveBeenCalledWith(
        "apply_note_modifications",
        expect.stringContaining('"velocity_deviation":127'),
      );
    });

    it("clamps probability to 0-1 range", () => {
      const notes: MidiNote[] = [{ pitch: 60, velocity: 100, duration: 0.5 }];
      const clip = createMockMidiClip(notes);
      const rng = createTestRng();

      applyMidiParams(clip as unknown as LiveAPI, { probability: -2.0 }, rng);

      expect(clip.call).toHaveBeenCalledWith(
        "apply_note_modifications",
        expect.stringContaining('"probability":0'),
      );
    });
  });
});
