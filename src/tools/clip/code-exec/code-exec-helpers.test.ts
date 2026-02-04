import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteEvent } from "#src/notation/types.ts";
import type { CodeNote } from "./code-exec-types.ts";
import {
  buildCodeExecutionContext,
  codeNoteToNoteEvent,
  extractNotesFromClip,
  getClipNoteCount,
  noteEventToCodeNote,
  applyNotesToClip,
} from "./code-exec-helpers.ts";

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

      const result = noteEventToCodeNote(noteEvent);

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

      const result = noteEventToCodeNote(noteEvent);

      expect(result.probability).toBe(1);
      expect(result.velocityDeviation).toBe(0);
    });
  });

  describe("codeNoteToNoteEvent", () => {
    it("should convert CodeNote to NoteEvent format", () => {
      const codeNote: CodeNote = {
        pitch: 67,
        start: 4.0,
        duration: 2.0,
        velocity: 110,
        probability: 0.5,
        velocityDeviation: 20,
      };

      const result = codeNoteToNoteEvent(codeNote);

      expect(result).toStrictEqual({
        pitch: 67,
        start_time: 4.0,
        duration: 2.0,
        velocity: 110,
        probability: 0.5,
        velocity_deviation: 20,
      });
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
        call: vi.fn().mockReturnValue(JSON.stringify(mockNotes)),
      };

      const result = extractNotesFromClip(mockClip as unknown as LiveAPI);

      expect(mockClip.call).toHaveBeenCalledWith(
        "get_notes_extended",
        0,
        128,
        0,
        expect.any(Number),
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
      const mockClip = {
        call: vi.fn().mockReturnValue(JSON.stringify({ notes: [] })),
      };

      const result = extractNotesFromClip(mockClip as unknown as LiveAPI);

      expect(result).toStrictEqual([]);
    });
  });

  describe("applyNotesToClip", () => {
    it("should remove existing notes and add new ones", () => {
      const mockClip = {
        call: vi.fn(),
      };
      const notes: CodeNote[] = [
        {
          pitch: 60,
          start: 0,
          duration: 1,
          velocity: 100,
          velocityDeviation: 0,
          probability: 1,
        },
      ];

      applyNotesToClip(mockClip as unknown as LiveAPI, notes);

      expect(mockClip.call).toHaveBeenCalledWith(
        "remove_notes_extended",
        0,
        128,
        0,
        expect.any(Number),
      );
      expect(mockClip.call).toHaveBeenCalledWith("add_new_notes", {
        notes: [
          {
            pitch: 60,
            start_time: 0,
            duration: 1,
            velocity: 100,
            velocity_deviation: 0,
            probability: 1,
          },
        ],
      });
    });

    it("should only remove notes when notes array is empty", () => {
      const mockClip = {
        call: vi.fn(),
      };

      applyNotesToClip(mockClip as unknown as LiveAPI, []);

      expect(mockClip.call).toHaveBeenCalledTimes(1);
      expect(mockClip.call).toHaveBeenCalledWith(
        "remove_notes_extended",
        0,
        128,
        0,
        expect.any(Number),
      );
    });
  });

  describe("getClipNoteCount", () => {
    it("should return note count within clip length", () => {
      const mockClip = {
        getProperty: vi.fn().mockReturnValue(8),
        call: vi.fn().mockReturnValue(JSON.stringify({ notes: [{}, {}, {}] })),
      };

      const result = getClipNoteCount(mockClip as unknown as LiveAPI);

      expect(mockClip.getProperty).toHaveBeenCalledWith("length");
      expect(mockClip.call).toHaveBeenCalledWith(
        "get_notes_extended",
        0,
        128,
        0,
        8,
      );
      expect(result).toBe(3);
    });
  });

  describe("buildCodeExecutionContext", () => {
    it("should build context for session clip", () => {
      const mockClip = {
        id: "clip-123",
        path: "live_set tracks 1 clip_slots 2 clip",
        getProperty: vi.fn((prop: string) => {
          const props: Record<string, unknown> = {
            name: "Test Clip",
            length: 16,
            signature_numerator: 4,
            signature_denominator: 4,
            looping: 1,
          };

          return props[prop];
        }),
      };

      // Mock LiveAPI.from
      const originalFrom = LiveAPI.from;

      LiveAPI.from = vi.fn((path: string) => {
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
            getProperty: vi.fn((prop: string) => {
              const props: Record<string, unknown> = {
                tempo: 120,
                signature_numerator: 4,
                signature_denominator: 4,
                scale_mode: 1,
                scale_name: "Minor",
                root_note: 0,
              };

              return props[prop];
            }),
          } as unknown as LiveAPI;
        }

        return {} as LiveAPI;
      }) as typeof LiveAPI.from;

      try {
        const result = buildCodeExecutionContext(
          mockClip as unknown as LiveAPI,
          "session",
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
        });
        expect(result.location).toStrictEqual({
          view: "session",
          sceneIndex: 2,
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
        path: "live_set tracks 0 arrangement_clips 3",
        getProperty: vi.fn((prop: string) => {
          const props: Record<string, unknown> = {
            name: "Arr Clip",
            length: 8,
            signature_numerator: 3,
            signature_denominator: 4,
            looping: 0,
          };

          return props[prop];
        }),
      };

      const originalFrom = LiveAPI.from;

      LiveAPI.from = vi.fn((path: string) => {
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
            getProperty: vi.fn((prop: string) => {
              const props: Record<string, unknown> = {
                tempo: 90,
                signature_numerator: 3,
                signature_denominator: 4,
                scale_mode: 0, // No scale
              };

              return props[prop];
            }),
          } as unknown as LiveAPI;
        }

        return {} as LiveAPI;
      }) as typeof LiveAPI.from;

      try {
        const result = buildCodeExecutionContext(
          mockClip as unknown as LiveAPI,
          "arrangement",
          undefined,
          32,
        );

        expect(result.track.type).toBe("audio");
        expect(result.track.color).toBeNull();
        expect(result.clip.looping).toBe(false);
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
});
