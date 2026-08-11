// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type NoteEvent } from "#src/notation/types.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as v8Console from "#src/shared/max/v8-max-console.ts";
import { type CodeNote } from "../code-exec-types.ts";
import {
  buildCodeExecutionContext,
  codeNoteToNoteEvent,
  extractNotesFromClip,
  getClipLocationInfo,
  getClipNoteCount,
  noteEventToCodeNote,
  applyNotesToClip,
  validateAndSanitizeNote,
  validateCodeNotes,
} from "../code-exec-helpers.ts";
import {
  codeNote,
  createMockClip,
  mockGetProperty,
  toLiveApiNote,
} from "./code-exec-test-helpers.ts";

describe("code-exec-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("noteEventToCodeNote", () => {
    it("should convert NoteEvent to CodeNote format", () => {
      const noteEvent: NoteEvent = {
        pitch: 60,
        start_time: 2.5,
        duration: 1.0,
        velocity: 100,
        probability: 0.8,
        velocity_deviation: 10,
      };

      const result = noteEventToCodeNote(noteEvent, 4);

      expect(result).toStrictEqual({
        pitch: 60,
        start: 2.5,
        duration: 1.0,
        velocity: 100,
        probability: 0.8,
        velocityDeviation: 10,
      });
    });

    it("should default optional properties", () => {
      const noteEvent: NoteEvent = {
        pitch: 64,
        start_time: 0,
        duration: 0.5,
        velocity: 80,
      };

      const result = noteEventToCodeNote(noteEvent, 4);

      expect(result.probability).toBe(1);
      expect(result.velocityDeviation).toBe(0);
    });

    it("scales Ableton beats to clip musical beats in compound meters", () => {
      // In 6/8 a musical beat is an eighth = 0.5 Ableton (quarter-note) beats, so
      // multiply by denominator/4: an Ableton beat of 3 → musical beat 6.
      const noteEvent: NoteEvent = {
        pitch: 60,
        start_time: 3,
        duration: 1.5,
        velocity: 100,
      };

      const result = noteEventToCodeNote(noteEvent, 8);

      expect(result.start).toBe(6);
      expect(result.duration).toBe(3);
    });
  });

  describe("codeNoteToNoteEvent", () => {
    it("should convert CodeNote to NoteEvent format", () => {
      const input: CodeNote = {
        pitch: 67,
        start: 4.0,
        duration: 2.0,
        velocity: 110,
        probability: 0.5,
        velocityDeviation: 20,
      };

      const result = codeNoteToNoteEvent(input, 4);

      expect(result).toStrictEqual({
        pitch: 67,
        start_time: 4.0,
        duration: 2.0,
        velocity: 110,
        probability: 0.5,
        velocity_deviation: 20,
      });
    });

    it("scales clip musical beats back to Ableton beats in compound meters", () => {
      // Inverse of noteEventToCodeNote: in 6/8, musical beat 6 → Ableton beat 3.
      const input: CodeNote = {
        pitch: 60,
        start: 6,
        duration: 3,
        velocity: 100,
        probability: 1,
        velocityDeviation: 0,
      };

      const result = codeNoteToNoteEvent(input, 8);

      expect(result.start_time).toBe(3);
      expect(result.duration).toBe(1.5);
    });
  });

  describe("extractNotesFromClip", () => {
    it("should extract and convert notes from clip", () => {
      const mockNotes = {
        notes: [
          { pitch: 60, start_time: 0, duration: 1, velocity: 100 },
          { pitch: 64, start_time: 1, duration: 0.5, velocity: 90 },
        ],
      };
      const mockClip = {
        getProperty: vi.fn((prop: string) =>
          prop === "signature_denominator" ? 4 : 8,
        ),
        call: vi.fn().mockReturnValue(JSON.stringify(mockNotes)),
      };

      const result = extractNotesFromClip(mockClip as unknown as LiveAPI);

      expect(mockClip.getProperty).toHaveBeenCalledWith("length");
      // length=8 → read-clip's window [-8, 16) so a pickup/overhang is seen.
      expect(mockClip.call).toHaveBeenCalledWith(
        "get_notes_extended",
        0,
        128,
        -8,
        24,
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toStrictEqual({
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
        probability: 1,
        velocityDeviation: 0,
      });
    });

    it("should return empty array for empty clip", () => {
      const mockClip = createMockClip(4, JSON.stringify({ notes: [] }));

      const result = extractNotesFromClip(mockClip as unknown as LiveAPI);

      expect(result).toStrictEqual([]);
    });
  });

  describe("applyNotesToClip", () => {
    it("should remove existing notes and add new ones", () => {
      const mockClip = createMockClip(4); // signature_denominator
      const notes: CodeNote[] = [codeNote(60, 0)];

      applyNotesToClip(mockClip as unknown as LiveAPI, notes);

      expect(mockClip.call).toHaveBeenCalledWith(
        "remove_notes_extended",
        0,
        128,
        -4,
        12,
      );
      expect(mockClip.call).toHaveBeenCalledWith("add_new_notes", {
        notes: [toLiveApiNote(codeNote(60, 0))],
      });
    });

    it("sorts notes ascending by start_time before adding (same-pitch survival)", () => {
      // User code returned two same-pitch notes later-onset-first. add_new_notes
      // deletes an earlier same-pitch note when a later-written note overlaps its
      // onset, so an unsorted write would drop the beat-0 note. The write must be
      // ascending by start_time so both survive.
      const mockClip = createMockClip(4); // signature_denominator
      const late = codeNote(60, 2, { velocity: 100 });
      const early = codeNote(60, 0, { velocity: 90 });

      applyNotesToClip(mockClip as unknown as LiveAPI, [late, early]);

      // Written ascending by start_time: the beat-0 note first.
      expect(mockClip.call).toHaveBeenCalledWith("add_new_notes", {
        notes: [toLiveApiNote(early), toLiveApiNote(late)],
      });
    });

    it("dedupes same-pitch+start duplicates (keep-last) and warns", () => {
      // User code returned two notes at the same pitch and onset. add_new_notes
      // deletes the earlier one when the later overlaps its onset, so without the
      // dedupe one note is silently dropped. Collapse keep-last and warn.
      const warn = vi.spyOn(v8Console, "warn").mockImplementation(() => {});
      const mockClip = createMockClip(4); // signature_denominator
      const first = codeNote(60, 0, { duration: 1, velocity: 100 });
      const last = codeNote(60, 0, { duration: 2, velocity: 80 });

      applyNotesToClip(mockClip as unknown as LiveAPI, [first, last]);

      // The duplicate collapses to the last write.
      expect(mockClip.call).toHaveBeenCalledWith("add_new_notes", {
        notes: [toLiveApiNote(last)],
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Dropped 1 duplicate note"),
      );
    });

    it("converts musical beats back to Ableton beats using the clip meter", () => {
      const mockClip = createMockClip(8); // 6/8 denominator
      const notes: CodeNote[] = [
        codeNote(60, 6, { duration: 3 }), // musical beat 6 → Ableton beat 3,
        // 3 musical eighths → 1.5 Ableton beats
      ];

      applyNotesToClip(mockClip as unknown as LiveAPI, notes);

      expect(mockClip.call).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          {
            pitch: 60,
            start_time: 3,
            duration: 1.5,
            velocity: 100,
            velocity_deviation: 0,
            probability: 1,
          },
        ],
      });
    });

    it("should only remove notes when notes array is empty", () => {
      const mockClip = createMockClip(4); // length=4 → window [-4, 8)

      applyNotesToClip(mockClip as unknown as LiveAPI, []);

      expect(mockClip.call).toHaveBeenCalledTimes(1);
      expect(mockClip.call).toHaveBeenCalledWith(
        "remove_notes_extended",
        0,
        128,
        -4,
        12,
      );
    });
  });

  describe("getClipNoteCount", () => {
    it("should count notes across read-clip's [-length, 2*length] window", () => {
      const mockClip = createMockClip(
        8,
        JSON.stringify({ notes: [{}, {}, {}] }),
      );

      const result = getClipNoteCount(mockClip as unknown as LiveAPI);

      expect(mockClip.getProperty).toHaveBeenCalledWith("length");
      // length=8 → window from -8 spanning 24 beats ([-8, 16]), matching
      // read-clip so pickups/overhang are counted (not the old [0, 8]).
      expect(mockClip.call).toHaveBeenCalledWith(
        "get_notes_extended",
        0,
        128,
        -8,
        24,
      );
      expect(result).toBe(3);
    });
  });

  describe("buildCodeExecutionContext", () => {
    it("should build context for session clip", () => {
      const mockClip = {
        id: "clip-123",
        path: livePath.track(1).clipSlot(2).clip(),
        trackIndex: 1,
        getProperty: mockGetProperty({
          name: "Test Clip",
          length: 16,
          signature_numerator: 4,
          signature_denominator: 4,
          looping: 1,
        }),
      };

      // Mock LiveAPI.from
      const originalFrom = LiveAPI.from;

      LiveAPI.from = vi.fn((pathLike: unknown) => {
        const path = String(pathLike);

        if (path.includes("tracks 1") && !path.includes("clip")) {
          return {
            getProperty: vi.fn((prop: string) => {
              if (prop === "name") return "Bass Track";
              if (prop === "has_midi_input") return 1;

              return null;
            }),
            getColor: vi.fn().mockReturnValue("#FF5500"),
          } as unknown as LiveAPI;
        }

        if (path === "live_set") {
          return {
            getProperty: mockGetProperty({
              tempo: 120,
              signature_numerator: 4,
              signature_denominator: 4,
              scale_mode: 1,
              scale_name: "Minor",
              root_note: 0,
            }),
          } as unknown as LiveAPI;
        }

        return {} as LiveAPI;
      }) as typeof LiveAPI.from;

      try {
        const result = buildCodeExecutionContext(
          mockClip as unknown as LiveAPI,
          "session",
          1,
          3,
          2,
        );

        expect(result.track).toStrictEqual({
          index: 1,
          name: "Bass Track",
          type: "midi",
          color: "#FF5500",
        });
        expect(result.clip).toStrictEqual({
          id: "clip-123",
          name: "Test Clip",
          length: 16,
          timeSignature: "4/4",
          looping: true,
          index: 1,
          count: 3,
        });
        expect(result.location).toStrictEqual({
          view: "session",
          slot: "1/2",
        });
        expect(result.liveSet).toStrictEqual({
          tempo: 120,
          timeSignature: "4/4",
          scale: "C Minor",
        });
        expect(result.beatsPerBar).toBe(4);
      } finally {
        LiveAPI.from = originalFrom;
      }
    });

    it("should build context for arrangement clip", () => {
      const mockClip = {
        id: "clip-456",
        path: livePath.track(0).arrangementClip(3),
        getProperty: mockGetProperty({
          name: "Arr Clip",
          length: 8,
          signature_numerator: 3,
          signature_denominator: 4,
          looping: 0,
        }),
      };

      const originalFrom = LiveAPI.from;

      LiveAPI.from = vi.fn((pathLike: unknown) => {
        const path = String(pathLike);

        if (path.includes("tracks 0") && !path.includes("arrangement")) {
          return {
            getProperty: vi.fn((prop: string) => {
              if (prop === "name") return "Audio Track";
              if (prop === "has_midi_input") return 0;

              return null;
            }),
            getColor: vi.fn().mockReturnValue(null),
          } as unknown as LiveAPI;
        }

        if (path === "live_set") {
          return {
            getProperty: mockGetProperty({
              tempo: 90,
              signature_numerator: 3,
              signature_denominator: 4,
              scale_mode: 0, // No scale
            }),
          } as unknown as LiveAPI;
        }

        return {} as LiveAPI;
      }) as typeof LiveAPI.from;

      try {
        const result = buildCodeExecutionContext(
          mockClip as unknown as LiveAPI,
          "arrangement",
          0,
          1,
          undefined,
          32,
        );

        expect(result.track.type).toBe("audio");
        expect(result.track.color).toBeNull();
        expect(result.clip.looping).toBe(false);
        expect(result.clip.index).toBe(0);
        expect(result.clip.count).toBe(1);
        expect(result.location).toStrictEqual({
          view: "arrangement",
          arrangementStart: 32,
        });
        expect(result.liveSet.scale).toBeUndefined();
        expect(result.beatsPerBar).toBe(3);
      } finally {
        LiveAPI.from = originalFrom;
      }
    });
  });

  describe("getClipLocationInfo", () => {
    it("should return session view info for session clip", () => {
      const mockClip = {
        path: livePath.track(0).clipSlot(2).clip(),
        getProperty: vi.fn().mockReturnValue(0), // is_arrangement_clip = 0
      };

      const result = getClipLocationInfo(mockClip as unknown as LiveAPI);

      expect(result).toStrictEqual({ view: "session", sceneIndex: 2 });
    });

    it("should return arrangement view info for arrangement clip", () => {
      const mockClip = {
        path: livePath.track(0).arrangementClip(3),
        getProperty: vi.fn((prop: string) => {
          if (prop === "is_arrangement_clip") return 1;
          if (prop === "start_time") return 16;

          return 0;
        }),
      };

      const result = getClipLocationInfo(mockClip as unknown as LiveAPI);

      expect(result).toStrictEqual({
        view: "arrangement",
        arrangementStartBeats: 16,
      });
    });
  });

  describe("validateAndSanitizeNote", () => {
    it("should validate a valid note", () => {
      const result = validateAndSanitizeNote({
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
        velocityDeviation: 0,
        probability: 1,
      });

      expect(result.valid).toBe(true);
    });

    it("should reject non-object values", () => {
      expect(validateAndSanitizeNote(null).valid).toBe(false);
      expect(validateAndSanitizeNote("string").valid).toBe(false);
      expect(validateAndSanitizeNote(42).valid).toBe(false);
    });

    it("should reject notes missing required properties", () => {
      expect(validateAndSanitizeNote({ start: 0 }).valid).toBe(false);
      expect(validateAndSanitizeNote({ pitch: 60 }).valid).toBe(false);
      expect(validateAndSanitizeNote({}).valid).toBe(false);
    });

    it("should default duration to 1 and velocity to 100", () => {
      const result = validateAndSanitizeNote({ pitch: 60, start: 0 });

      expect(result.valid).toBe(true);
      expect(result.valid && result.note.duration).toBe(1);
      expect(result.valid && result.note.velocity).toBe(100);
    });

    it("should reject notes with zero or negative duration", () => {
      expect(
        validateAndSanitizeNote({
          pitch: 60,
          start: 0,
          duration: 0,
          velocity: 100,
        }).valid,
      ).toBe(false);
      expect(
        validateAndSanitizeNote({
          pitch: 60,
          start: 0,
          duration: -1,
          velocity: 100,
        }).valid,
      ).toBe(false);
    });

    it("should clamp pitch to 0-127", () => {
      const low = validateAndSanitizeNote({
        pitch: -10,
        start: 0,
        duration: 1,
        velocity: 100,
      });
      const high = validateAndSanitizeNote({
        pitch: 200,
        start: 0,
        duration: 1,
        velocity: 100,
      });

      expect(low.valid && low.note.pitch).toBe(0);
      expect(high.valid && high.note.pitch).toBe(127);
    });

    it("should clamp velocity to 1-127", () => {
      const low = validateAndSanitizeNote({
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 0,
      });
      const high = validateAndSanitizeNote({
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 200,
      });

      expect(low.valid && low.note.velocity).toBe(1);
      expect(high.valid && high.note.velocity).toBe(127);
    });

    it("keeps velocity 0 with allowVelocityZero (MIDI JSON's delete marker)", () => {
      // Only MIDI JSON opts in; user code returning velocity 0 still clamps to 1
      // (above), since Live rejects it and there is nothing to delete.
      const result = validateAndSanitizeNote(
        { pitch: 60, start: 0, duration: 1, velocity: 0 },
        { allowVelocityZero: true },
      );

      expect(result.valid && result.note.velocity).toBe(0);
    });

    it("should default optional properties", () => {
      const result = validateAndSanitizeNote({
        pitch: 60,
        start: 0,
        duration: 1,
        velocity: 100,
      });

      expect(result.valid).toBe(true);
      expect(result.valid && result.note.velocityDeviation).toBe(0);
      expect(result.valid && result.note.probability).toBe(1);
    });
  });

  describe("validateCodeNotes", () => {
    it("should validate an array of notes", () => {
      const result = validateCodeNotes([
        { pitch: 60, start: 0, duration: 1, velocity: 100 },
        { pitch: 72, start: 1, duration: 0.5, velocity: 90 },
      ]);

      expect(result.success).toBe(true);
      expect(result.success && result.notes).toHaveLength(2);
    });

    it("should return error for non-array result", () => {
      const result = validateCodeNotes("not an array");

      expect(result.success).toBe(false);
      expect(!result.success && result.error).toContain("must return an array");
    });

    it("should filter out invalid notes silently", () => {
      const result = validateCodeNotes([
        { pitch: 60, start: 0, duration: 1, velocity: 100 },
        { pitch: 60 }, // missing required fields
        null,
        { pitch: 72, start: 1, duration: 1, velocity: 100 },
      ]);

      expect(result.success).toBe(true);
      expect(result.success && result.notes).toHaveLength(2);
    });
  });
});
