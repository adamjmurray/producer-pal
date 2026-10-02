// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  handleDuplicateLoopWithEdits,
  handleNoteUpdates,
} from "../../helpers/notes/note-updates.ts";
import { applyTransformsToExistingNotes } from "../../helpers/notes/note-transforms.ts";
import { makeNotesMockClip, rawNote } from "./notes-mock-test-helpers.ts";
import {
  type ClipReasons,
  newClipReasons,
} from "../../helpers/entries/clip-reasons.ts";

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

describe("note-updates", () => {
  let reasons: ClipReasons;

  beforeEach(() => {
    vi.clearAllMocks();
    reasons = newClipReasons();
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
        reasons,
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
        reasons,
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

  describe("handleNoteUpdates keeps what the call didn't touch", () => {
    // A muted note with a release velocity and a downward velocity range:
    // three things bar|beat can't spell.
    const MUTED = {
      ...rawNote(60, 0, 1),
      mute: 1,
      release_velocity: 30,
      velocity_deviation: -20,
    };
    const { note_id: _id, ...MUTED_WRITTEN } = MUTED;

    /**
     * Merge `notes` into a clip holding MUTED, in the given notation.
     * @param notes - The new notes
     * @param notation - Notation they're written in
     * @returns What the update wrote to the clip
     */
    function mergeInto(
      notes: string,
      notation?: "midi-json",
    ): Record<string, number>[] {
      const { mockClip, addedNotes } = makeNotesMockClip([MUTED]);

      handleNoteUpdates(
        mockClip as unknown as LiveAPI,
        reasons,
        notes,
        undefined,
        undefined,
        4,
        4,
        makeCtx(),
        notation,
      );

      return addedNotes;
    }

    it("rewrites an untouched note unchanged on a bar|beat merge", () => {
      expect(mergeInto("D3 1|3")[0]).toStrictEqual(MUTED_WRITTEN);
    });

    it("rewrites an untouched note unchanged on a midi-json merge", () => {
      const added = mergeInto(
        '[{"pitch":62,"start":2,"duration":1,"velocity":100}]',
        "midi-json",
      );

      expect(added[0]).toStrictEqual(MUTED_WRITTEN);
    });

    it("gives new bar|beat notes the defaults, not the existing notes' values", () => {
      // The existing note is v100 with a 1-beat duration; make it v80 n/8 so
      // a new note picking up its values would show.
      const { mockClip, addedNotes } = makeNotesMockClip([
        { ...rawNote(60, 0, 1), velocity: 80, duration: 0.5 },
      ]);

      handleNoteUpdates(
        mockClip as unknown as LiveAPI,
        reasons,
        "D3 1|3",
        undefined,
        undefined,
        4,
        4,
        makeCtx(),
        undefined,
      );

      expect(addedNotes[1]).toStrictEqual({
        pitch: 62,
        start_time: 2,
        duration: 1,
        velocity: 100,
        probability: 1,
        velocity_deviation: 0,
      });
    });

    it("rewrites an untouched note unchanged when only transforms run", () => {
      const { mockClip, addedNotes } = makeNotesMockClip([
        MUTED,
        rawNote(62, 2, 2),
      ]);

      handleNoteUpdates(
        mockClip as unknown as LiveAPI,
        reasons,
        undefined,
        "D3: velocity = 50",
        undefined,
        4,
        4,
        makeCtx(),
        undefined,
      );

      expect(addedNotes[0]).toStrictEqual(MUTED_WRITTEN);
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
        reasons,
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

// A muted E3 on beat 1 (bar|beat 1|2), with a release velocity of its own.
const MUTED = { ...rawNote(64, 1, 9), mute: 1, release_velocity: 30 };
const { note_id: _id, ...MUTED_WRITTEN } = MUTED;

describe("muted notes in an edit", () => {
  let reasons: ClipReasons;

  beforeEach(() => {
    reasons = newClipReasons();
  });

  function merge(notes: string, transforms?: string) {
    const { mockClip, addedNotes } = makeNotesMockClip([
      rawNote(60, 0, 1),
      MUTED,
    ]);
    const result = handleNoteUpdates(
      mockClip as unknown as LiveAPI,
      reasons,
      notes,
      transforms,
      undefined,
      4,
      4,
      makeCtx(),
      undefined,
    );

    return { addedNotes, result };
  }

  it("keeps a muted note through a merge and counts only visible ones", () => {
    const { addedNotes, result } = merge("G3 1|3");

    expect(addedNotes).toHaveLength(3);
    expect(addedNotes).toContainEqual(MUTED_WRITTEN);
    expect(result?.noteCount).toBe(1);
  });

  it("replaces a muted note when a note lands on its pitch and start", () => {
    const { addedNotes } = merge("E3 1|2");

    const written = addedNotes.filter((note) => note.pitch === 64);

    expect(written).toHaveLength(1);
    expect(written[0]).not.toHaveProperty("mute");
    expect(written[0]).not.toHaveProperty("release_velocity");
  });

  it("leaves a muted note alone when transforms run after a merge", () => {
    const { addedNotes, result } = merge("G3 1|3", "velocity = 20");

    expect(addedNotes).toContainEqual(MUTED_WRITTEN);
    expect(result?.transformed).toBe(2);
  });

  it("is not deleted by a v0 aimed at it", () => {
    const { addedNotes } = merge("v0 E3 1|2");

    expect(addedNotes).toContainEqual(MUTED_WRITTEN);
  });

  it("is not copied by a bar copy", () => {
    const { mockClip, addedNotes } = makeNotesMockClip([
      rawNote(60, 0, 1),
      MUTED,
    ]);

    handleNoteUpdates(
      mockClip as unknown as LiveAPI,
      reasons,
      "@2=1",
      undefined,
      undefined,
      4,
      4,
      makeCtx({ clipDuration: 8 }),
      undefined,
    );

    expect(
      addedNotes.map((note) => [note.pitch, note.start_time]),
    ).toStrictEqual([
      [60, 0],
      [64, 1],
      [60, 4],
    ]);
  });

  describe("with only transforms", () => {
    function transform(notes: object[]) {
      const { mockClip, addedNotes } = makeNotesMockClip(notes);
      const clip = { ...mockClip, id: "123" };
      const result = applyTransformsToExistingNotes(
        clip as unknown as LiveAPI,
        reasons,
        undefined,
        "velocity = 20",
        4,
        4,
      );

      return { addedNotes, result };
    }

    it("changes only visible notes and writes the muted one back as it was", () => {
      const { addedNotes, result } = transform([rawNote(60, 0, 1), MUTED]);

      expect(result).toStrictEqual({ noteCount: 1, transformed: 1 });
      expect(addedNotes).toContainEqual(MUTED_WRITTEN);
      expect(addedNotes.filter((note) => note.velocity === 20)).toHaveLength(1);
    });

    it("leaves the muted note when preTransforms v0 clears the visible ones", () => {
      const { mockClip, addedNotes } = makeNotesMockClip([
        rawNote(60, 0, 1),
        rawNote(67, 2, 2),
        MUTED,
      ]);
      const result = applyTransformsToExistingNotes(
        mockClip as unknown as LiveAPI,
        reasons,
        "v0",
        undefined,
        4,
        4,
      );

      expect(result.transformed).toBe(2);
      expect(addedNotes).toStrictEqual([MUTED_WRITTEN]);
    });

    it("says a clip with only muted notes has nothing to edit", () => {
      const { addedNotes, result } = transform([MUTED]);

      expect(result).toStrictEqual({ noteCount: 0 });
      expect(addedNotes).toStrictEqual([]);
      expect(reasons.said.get("123")?.join("; ")).toBe(
        "transforms ignored: the clip has only muted notes, which edits leave alone",
      );
    });
  });
});
