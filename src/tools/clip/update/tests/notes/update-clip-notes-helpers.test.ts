// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  handleDuplicateLoopWithEdits,
  handleNoteUpdates,
} from "../../helpers/update-clip-notes-helpers.ts";

// Raw note as returned by the Live API (extra props stripped before re-add).
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

// Minimal ClipContext for handleNoteUpdates (only used by transform variables,
// which the tests below don't exercise beyond a bare delete).
function makeCtx(overrides: Partial<ClipContext> = {}): ClipContext {
  return {
    clipDuration: 4,
    clipIndex: 0,
    clipCount: 1,
    barDuration: 4,
    timeSigDenominator: 4,
    ...overrides,
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

// Register a MIDI clip (by id) with two existing notes so LiveAPI.from(id)
// inside handleDuplicateLoop* resolves to the same call/get mocks.
function setupMidiClip(id: string) {
  return registerMockObject(id, {
    path: "live_set tracks 0 clip_slots 0 clip",
    type: "Clip",
    properties: {
      is_midi_clip: 1,
      is_arrangement_clip: 0,
      length: 4,
      signature_numerator: 4,
      signature_denominator: 4,
    },
    methods: {
      get_notes_extended: () =>
        JSON.stringify({ notes: [rawNote(60, 0, 1), rawNote(64, 1, 2)] }),
    },
  });
}

function removeNoteCalls(clip: {
  call: ReturnType<typeof vi.fn>;
}): unknown[][] {
  return clip.call.mock.calls.filter(
    (c: unknown[]) => c[0] === "remove_notes_extended",
  );
}

describe("update-clip-notes-helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleNoteUpdates", () => {
    it("reports transformed undefined for a notes+preTransforms update on an empty clip", () => {
      // No existing notes + a preTransform string: applyPreTransformsToExisting
      // must early-return matchCount undefined (guarding on existingNotes.length
      // === 0 || preTransformString == null). Any mutation that instead runs
      // applyTransforms on the empty array reports matchCount 0.
      const { mockClip } = makeNotesMockClip([]);

      const result = handleNoteUpdates(
        mockClip as unknown as LiveAPI,
        "1|1 C3", // new notes to merge
        undefined, // no post-transform
        "v0", // preTransform present, but no existing notes to match
        4,
        4,
        makeCtx(),
        undefined,
      );

      expect(result?.transformed).toBeUndefined();
    });

    it("threads the time signature into formatNotation when merging existing notes", () => {
      // At 4/8 an existing note at Ableton beat 2 formats to bar 2 beat 1 and
      // round-trips back to beat 2. Dropping the time-sig options (formatting as
      // the 4/4 default) would round-trip it to a different beat.
      const { mockClip, addedNotes } = makeNotesMockClip<{
        pitch: number;
        start_time: number;
      }>([rawNote(60, 2, 1)]);

      handleNoteUpdates(
        mockClip as unknown as LiveAPI,
        "1|1 D3", // new note at Ableton beat 0
        undefined,
        undefined,
        4,
        8, // non-4 denominator
        makeCtx({ timeSigDenominator: 8 }),
        undefined,
      );

      // The pre-existing C3 (pitch 60) must survive at its original beat 2.
      expect(
        addedNotes.some(
          (n) => n.pitch === 60 && Math.abs(n.start_time - 2) < 1e-6,
        ),
      ).toBe(true);
    });
  });

  describe("handleDuplicateLoopWithEdits", () => {
    function callWithEdits(
      overrides: {
        notationString?: string;
        transformString?: string;
        preTransformString?: string;
      } = {},
    ) {
      const clip = LiveAPI.from("id 100");

      return handleDuplicateLoopWithEdits({
        clip,
        notationString: overrides.notationString,
        transformString: overrides.transformString,
        preTransformString: overrides.preTransformString,
        timeSigNumerator: 4,
        timeSigDenominator: 4,
        clipIndex: 0,
        clipCount: 1,
        notation: undefined,
      });
    }

    it("skips the pre-double stage entirely when preTransforms is absent", () => {
      // Stage 1 only runs when preTransformString != null. With no edits at all
      // the function just doubles; forcing the guard true would flush the
      // existing notes (a remove_notes_extended) before doubling.
      const clip = setupMidiClip("100");

      callWithEdits();

      expect(removeNoteCalls(clip)).toHaveLength(0);
      expect(clip.call).toHaveBeenCalledWith("duplicate_loop");
    });

    it("merges after doubling when only notes are given", () => {
      // notation != null → both operands of `== null && == null` false → NOT an
      // early return → the merge runs (a remove_notes_extended). Kills the
      // always-early-return / || / first-operand mutations.
      const clip = setupMidiClip("100");

      callWithEdits({ notationString: "1|1 C3" });

      expect(removeNoteCalls(clip).length).toBeGreaterThan(0);
    });

    it("returns dupResult without merging when neither notes nor transforms are given", () => {
      // Both null → early return dupResult → NO merge (no remove_notes_extended).
      // Behavioral guard for the early-return branch. (Forcing the guard false or
      // emptying its block is an equivalent mutant here: handleNoteUpdates called
      // with all-null strings is itself a no-op returning null, so the fall-
      // through path produces the identical dupResult with no note writes.)
      const clip = setupMidiClip("100");

      callWithEdits();

      expect(removeNoteCalls(clip)).toHaveLength(0);
    });

    it("merges after doubling when only transforms are given, and returns the merge result", () => {
      // transform != null (notes null) → NOT an early return → the transform
      // runs across the doubled clip. The returned result carries `transformed`
      // (from the merge), which `mergeResult ?? dupResult` preserves; a
      // `mergeResult && dupResult` mutation would drop it back to dupResult.
      const clip = setupMidiClip("100");

      const result = callWithEdits({ transformString: "pitch += 12" });

      expect(removeNoteCalls(clip).length).toBeGreaterThan(0);
      expect(result?.transformed).toBe(2);
    });
  });
});
