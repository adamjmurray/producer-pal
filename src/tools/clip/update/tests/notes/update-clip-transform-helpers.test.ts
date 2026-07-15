// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  applyTransformsToExistingNotes,
  buildClipContext,
} from "../../helpers/update-clip-transform-helpers.ts";

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

function createSessionClipMock(length = 8) {
  return {
    getProperty: vi.fn((prop: string) => {
      if (prop === "length") return length;
      if (prop === "is_arrangement_clip") return 0;

      return 0;
    }),
  };
}

// Mock clip that returns `existingNotes` from get_notes_extended and captures
// every note passed to add_new_notes into the returned `addedNotes` array.
function makeNotesMockClip<T extends object = Record<string, number>>(
  existingNotes: object[],
  length = 4,
): {
  mockClip: {
    getProperty: ReturnType<typeof vi.fn>;
    call: ReturnType<typeof vi.fn>;
  };
  addedNotes: T[];
} {
  const addedNotes: T[] = [];
  const mockClip = {
    getProperty: vi.fn((prop: string) => (prop === "length" ? length : 0)),
    call: vi.fn((method: string, ...args: unknown[]) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: existingNotes });
      }

      if (method === "add_new_notes") {
        addedNotes.push(...(args[0] as { notes: T[] }).notes);
      }

      return "[]";
    }),
  };

  return { mockClip, addedNotes };
}

describe("update-clip-transform-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildClipContext", () => {
    it("uses content length for session clips", () => {
      const mockClip = createSessionClipMock();

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

      const mockClip = createSessionClipMock();

      const ctx = buildClipContext(mockClip as unknown as LiveAPI, 0, 1, 4, 4);

      expect(ctx.scalePitchClassMask).toBe(2741);
    });

    it("scales clipDuration by timeSigDenominator/4 for a non-4 denominator (session)", () => {
      // At 4/8, a content length of 6 Ableton (quarter-note) beats is 6 * (8/4)
      // = 12 musical beats. A `/` mutation would give 6 / 2 = 3.
      const mockClip = {
        getProperty: vi.fn((prop: string) => {
          if (prop === "length") return 6;
          if (prop === "is_arrangement_clip") return 0;

          return 0;
        }),
      };

      const ctx = buildClipContext(mockClip as unknown as LiveAPI, 0, 1, 4, 8);

      expect(ctx.clipDuration).toBe(12);
      expect(ctx.arrangementStart).toBeUndefined();
    });

    it("scales clipDuration and arrangementStart by timeSigDenominator/4 (arrangement)", () => {
      // At 4/8: arrangementStart = start_time 4 * (8/4) = 8 (a `/` gives 2);
      // clipDuration = (end_time 10 - start_time 4) * 2 = 12 (a `/` gives 3).
      const mockClip = {
        getProperty: vi.fn((prop: string) => {
          if (prop === "is_arrangement_clip") return 1;
          if (prop === "start_time") return 4;
          if (prop === "end_time") return 10;
          if (prop === "length") return 8;

          return 0;
        }),
      };

      const ctx = buildClipContext(mockClip as unknown as LiveAPI, 0, 1, 4, 8);

      expect(ctx.clipDuration).toBe(12);
      expect(ctx.arrangementStart).toBe(8);
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

      const { mockClip, addedNotes } = makeNotesMockClip(existingNotes);

      const result = applyTransformsToExistingNotes(
        mockClip as unknown as LiveAPI,
        undefined,
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
        -4,
        12,
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

    it("re-adds notes sorted ascending by start_time", () => {
      // Live may hand notes back in any order; a transform must re-add them
      // ascending so an onset overlap can't delete an earlier same-pitch note.
      const existingNotes = [
        rawNote(60, 2, 100),
        rawNote(60, 0, 101),
        rawNote(60, 1, 102),
      ];
      const { mockClip, addedNotes } = makeNotesMockClip<{
        start_time: number;
      }>(existingNotes);

      applyTransformsToExistingNotes(
        mockClip as unknown as LiveAPI,
        undefined,
        "velocity = 50",
        4,
        4,
      );

      expect(addedNotes.map((n) => n.start_time)).toStrictEqual([0, 1, 2]);
    });

    it("writes the expanded note list when a ratchet op runs", () => {
      const existingNotes = [rawNote(60, 0, 100), rawNote(64, 2, 101)];
      const { mockClip, addedNotes } = makeNotesMockClip<{
        start_time: number;
        duration: number;
      }>(existingNotes);

      applyTransformsToExistingNotes(
        mockClip as unknown as LiveAPI,
        undefined,
        "ratchet(2)",
        4,
        4,
      );

      // each note split into 2 -> 4 written, ascending by start_time
      expect(addedNotes).toHaveLength(4);
      expect(addedNotes.map((n) => n.start_time)).toStrictEqual([
        0, 0.5, 2, 2.5,
      ]);
    });

    it("writes the collapsed note list when a merge op runs", () => {
      const existingNotes = [rawNote(60, 0, 100), rawNote(60, 1, 101)];
      const { mockClip, addedNotes } = makeNotesMockClip<{
        start_time: number;
        duration: number;
      }>(existingNotes);

      applyTransformsToExistingNotes(
        mockClip as unknown as LiveAPI,
        "merge()",
        undefined,
        4,
        4,
      );

      // two same-pitch notes spanned into one (0..2)
      expect(addedNotes).toStrictEqual([
        expect.objectContaining({ start_time: 0, duration: 2 }),
      ]);
    });

    it("dedupes a same-pitch+start collision a transform creates (keep-last)", () => {
      // Two distinct notes share a start; forcing both onto the same pitch
      // collides them at the exact same pitch+onset. Without a dedupe both are
      // written and Live deletes one non-deterministically — the transform path
      // must dedupe keep-last like the merge path. Before the fix it sorted
      // without deduping and wrote both.
      const existingNotes = [rawNote(60, 0, 100), rawNote(64, 0, 101)];
      const { mockClip, addedNotes } = makeNotesMockClip<{
        pitch: number;
        start_time: number;
      }>(existingNotes);

      applyTransformsToExistingNotes(
        mockClip as unknown as LiveAPI,
        undefined,
        "pitch = 72", // collapse both onto pitch 72 at start 0
        4,
        4,
      );

      expect(addedNotes).toStrictEqual([
        expect.objectContaining({ pitch: 72, start_time: 0 }),
      ]);
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
        undefined,
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

    it("should handle missing notes property from get_notes_extended", () => {
      const mockClip = {
        getProperty: vi.fn(() => 4),
        call: vi.fn((method: string) => {
          if (method === "get_notes_extended") {
            return JSON.stringify({}); // no "notes" key
          }

          return "[]";
        }),
      };

      const result = applyTransformsToExistingNotes(
        mockClip as unknown as LiveAPI,
        undefined,
        "velocity = 50",
        4,
        4,
      );

      expect(result.noteCount).toBe(0);
    });

    it("clears a pickup note before the clip start instead of orphaning it", () => {
      // Regression: preTransforms used to read only the playable region
      // [0, length], so a pickup at a negative start_time was invisible — `v0`
      // reported "no notes to transform" and left the pickup orphaned while
      // lying noteCount: 0. The read AND remove must use read-clip's
      // [-length, 2*length] window so the pickup is seen, transformed, removed.
      const pickup = rawNote(60, -0.5, 100); // half a beat before the start
      const removeCalls: unknown[][] = [];
      let cleared = false;
      const mockClip = {
        getProperty: vi.fn((prop: string) => (prop === "length" ? 4 : 0)),
        call: vi.fn((method: string, ...args: unknown[]) => {
          if (method === "get_notes_extended") {
            // Live only surfaces the pickup when the window reaches before beat 0.
            const fromTime = args[2] as number;

            return JSON.stringify({
              notes: fromTime < 0 && !cleared ? [pickup] : [],
            });
          }

          if (method === "remove_notes_extended") {
            removeCalls.push(args);
            cleared = true;
          }

          return "[]";
        }),
      };

      const result = applyTransformsToExistingNotes(
        mockClip as unknown as LiveAPI,
        "v0", // preTransform deletes every matched note
        undefined,
        4,
        4,
      );

      // The pickup was found and deleted, not skipped as "no notes to transform".
      expect(result.transformed).toBe(1);
      expect(result.noteCount).toBe(0);
      // Remove used the pickup-inclusive window (length 4 → [-4, 8)).
      expect(removeCalls).toContainEqual([0, 128, -4, 12]);
      // Nothing re-added: v0 cleared the only note.
      expect(mockClip.call).not.toHaveBeenCalledWith(
        "add_new_notes",
        expect.anything(),
      );
    });
  });

  describe("buildClipContext - chromatic scale", () => {
    it("returns undefined scalePitchClassMask for chromatic scale", () => {
      registerMockObject("live_set", {
        path: "live_set",
        type: "Song",
        properties: {
          scale_mode: 1,
          root_note: 0,
          // All 12 intervals = chromatic
          scale_intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        },
      });

      const mockClip = createSessionClipMock(4);

      const ctx = buildClipContext(mockClip as unknown as LiveAPI, 0, 1, 4, 4);

      expect(ctx.scalePitchClassMask).toBeUndefined();
    });
  });
});
