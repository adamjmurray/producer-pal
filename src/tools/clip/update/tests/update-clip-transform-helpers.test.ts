// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  applyTransformsToExistingNotes,
  buildClipContext,
} from "../helpers/update-clip-transform-helpers.ts";

// Helper to create raw notes as returned by Live API (with extra properties)
function rawNote(pitch: number, startTime: number, noteId: number) {
  return {
    note_id: noteId,
    pitch,
    start_time: startTime,
    duration: 1,
    velocity: 100,
    mute: 0,
    probability: 1,
    velocity_deviation: 0,
    release_velocity: 64,
  };
}

describe("update-clip-transform-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildClipContext", () => {
    it("uses content length for session clips", () => {
      const mockClip = {
        getProperty: vi.fn((prop: string) => {
          if (prop === "length") return 8;
          if (prop === "is_arrangement_clip") return 0;

          return 0;
        }),
      };

      const ctx = buildClipContext(mockClip as unknown as LiveAPI, 0, 1, 4, 4);

      expect(ctx.clipDuration).toBe(8);
      expect(ctx.arrangementStart).toBeUndefined();
    });

    it("includes scalePitchClassMask when scale is active", () => {
      registerMockObject("live_set", {
        path: "live_set",
        type: "Song",
        properties: {
          scale_mode: 1,
          root_note: 0,
          scale_intervals: [0, 2, 4, 5, 7, 9, 11], // C major
        },
      });

      const mockClip = {
        getProperty: vi.fn((prop: string) => {
          if (prop === "length") return 8;
          if (prop === "is_arrangement_clip") return 0;

          return 0;
        }),
      };

      const ctx = buildClipContext(mockClip as unknown as LiveAPI, 0, 1, 4, 4);

      expect(ctx.scalePitchClassMask).toBe(2741);
    });

    it("uses arrangement length (end_time - start_time) for arrangement clips", () => {
      const mockClip = {
        getProperty: vi.fn((prop: string) => {
          if (prop === "is_arrangement_clip") return 1;
          if (prop === "start_time") return 4; // starts at beat 4
          if (prop === "end_time") return 20; // ends at beat 20
          if (prop === "length") return 8; // content length (shorter)

          return 0;
        }),
      };

      const ctx = buildClipContext(mockClip as unknown as LiveAPI, 0, 1, 4, 4);

      // Should use end_time - start_time = 16, NOT length = 8
      expect(ctx.clipDuration).toBe(16);
      expect(ctx.arrangementStart).toBe(4);
    });
  });

  describe("applyTransformsToExistingNotes", () => {
    it("should apply transforms to existing notes", () => {
      // Live API returns notes with extra properties (note_id, mute, release_velocity)
      // that must be stripped before passing to add_new_notes
      const existingNotes = [
        rawNote(60, 0, 100),
        rawNote(64, 1, 101),
        rawNote(67, 2, 102),
      ];

      const addedNotes: unknown[] = [];
      const mockClip = {
        getProperty: vi.fn((prop: string) => {
          if (prop === "length") return 4;

          return 0;
        }),
        call: vi.fn((method: string, ...args: unknown[]) => {
          if (method === "get_notes_extended") {
            return JSON.stringify({ notes: existingNotes });
          }

          if (method === "add_new_notes") {
            addedNotes.push(...(args[0] as { notes: unknown[] }).notes);
          }

          return "[]";
        }),
      };

      const result = applyTransformsToExistingNotes(
        mockClip as unknown as LiveAPI,
        "velocity = 50",
        4,
        4,
      );

      expect(result.noteCount).toBe(3);
      expect(result.transformed).toBe(3);
      expect(mockClip.call).toHaveBeenCalledWith(
        "remove_notes_extended",
        0,
        128,
        0,
        expect.any(Number),
      );
      expect(mockClip.call).toHaveBeenCalledWith(
        "add_new_notes",
        expect.objectContaining({ notes: expect.any(Array) }),
      );
      // Verify transforms were applied (velocity set to 50)
      expect(addedNotes).toHaveLength(3);

      for (const note of addedNotes) {
        expect((note as { velocity: number }).velocity).toBe(50);
      }

      // Verify extra Live API properties were stripped (these cause add_new_notes to fail)
      for (const note of addedNotes) {
        const n = note as Record<string, unknown>;

        expect(n).not.toHaveProperty("note_id");
        expect(n).not.toHaveProperty("mute");
        expect(n).not.toHaveProperty("release_velocity");
      }
    });

    it("should warn and return 0 when clip has no notes", () => {
      const mockClip = {
        getProperty: vi.fn(() => 4),
        call: vi.fn((method: string) => {
          if (method === "get_notes_extended") {
            return JSON.stringify({ notes: [] });
          }

          return "[]";
        }),
      };

      const result = applyTransformsToExistingNotes(
        mockClip as unknown as LiveAPI,
        "velocity = 50",
        4,
        4,
      );

      expect(result.noteCount).toBe(0);
      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining("transforms ignored: clip has no notes"),
      );
      // Should NOT call remove_notes_extended or add_new_notes
      expect(mockClip.call).not.toHaveBeenCalledWith(
        "remove_notes_extended",
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
