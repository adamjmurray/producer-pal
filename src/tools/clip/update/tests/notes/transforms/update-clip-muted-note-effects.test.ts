// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";
import {
  type ClipReasons,
  newClipReasons,
} from "../../../helpers/entries/clip-reasons.ts";
import { applyTransformsToExistingNotes } from "../../../helpers/notes/note-transforms.ts";
import { handleNoteUpdates } from "../../../helpers/notes/note-updates.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import { clipRegionProperty } from "../notes-mock-test-helpers.ts";

interface HeldNote {
  pitch: number;
  start_time: number;
  duration: number;
  velocity: number;
  mute: number;
  probability: number;
  velocity_deviation: number;
  release_velocity: number;
}

const held = (
  pitch: number,
  start_time: number,
  overrides: Partial<HeldNote> = {},
): HeldNote => ({
  pitch,
  start_time,
  duration: 1,
  velocity: 100,
  mute: 0,
  probability: 1,
  velocity_deviation: 0,
  release_velocity: 64,
  ...overrides,
});

const E3 = 64;
const C3 = 60;
const CS3 = 61;

/**
 * What Live keeps when notes are added: whichever of two same-pitch notes
 * starts earlier is cut at the later one's start.
 * @param notes - Notes as written
 * @returns The notes as Live would hold them
 */
function liveKeeps(notes: HeldNote[]): HeldNote[] {
  const sorted = notes.toSorted(
    (a, b) => a.pitch - b.pitch || a.start_time - b.start_time,
  );

  return sorted.map((note, i) => {
    const next = sorted[i + 1];

    return next?.pitch === note.pitch &&
      next.start_time < note.start_time + note.duration
      ? { ...note, duration: next.start_time - note.start_time }
      : note;
  });
}

/**
 * A clip that holds notes the way Live does: the write goes through liveKeeps.
 * @param existing - Notes the clip starts with
 * @returns The clip
 */
function liveClip(existing: HeldNote[]): LiveAPI {
  let notesInClip = existing;

  return {
    id: "123",
    getProperty: vi.fn(clipRegionProperty()),
    call: vi.fn((method: string, ...args: unknown[]) => {
      if (method === "get_notes_extended") {
        return JSON.stringify({ notes: notesInClip });
      }

      if (method === "remove_notes_extended") {
        notesInClip = [];
      }

      if (method === "add_new_notes") {
        const notes = (args[0] as { notes: Partial<HeldNote>[] }).notes;

        notesInClip = liveKeeps(
          notes.map((n) => ({ ...writtenDefaults(), ...n }) as HeldNote),
        );
      }

      return "[]";
    }),
  } as unknown as LiveAPI;
}

/** @returns Defaults for the fields a freshly written note leaves out */
function writtenDefaults(): Partial<HeldNote> {
  return { mute: 0, probability: 1, velocity_deviation: 0 };
}

const ctx: ClipContext = {
  clipDuration: 4,
  clipIndex: 0,
  clipCount: 1,
  barDuration: 4,
  timeSigDenominator: 4,
};

describe("muted notes a note write lands on", () => {
  let reasons: ClipReasons;

  beforeEach(() => {
    reasons = newClipReasons();
  });

  /**
   * Run a notes and/or transforms update.
   * @param existing - The clip's notes
   * @param notes - New notes, or undefined
   * @param transforms - Transforms, or undefined
   * @returns What the clip's entry would say
   */
  function update(
    existing: HeldNote[],
    notes: string | undefined,
    transforms?: string,
  ): string | undefined {
    handleNoteUpdates(
      liveClip(existing),
      reasons,
      notes,
      transforms,
      undefined,
      4,
      4,
      ctx,
      undefined,
    );

    return reasons.said.get("123")?.join("; ");
  }

  describe("a transform lands a visible note on a muted one", () => {
    it("says the muted note was replaced", () => {
      const said = update(
        [held(C3, 0), held(CS3, 0, { mute: 1 })],
        "G3 1|3",
        "C3: pitch += 1",
      );

      expect(said).toBe("replaced 1 muted note at the same pitch and start");
    });

    it("counts several", () => {
      const said = update(
        [
          held(C3, 0),
          held(C3, 1),
          held(CS3, 0, { mute: 1 }),
          held(CS3, 1, { mute: 1 }),
        ],
        "G3 1|3",
        "C3: pitch += 1",
      );

      expect(said).toBe("replaced 2 muted notes at the same pitch and start");
    });

    it("lets the visible note win", () => {
      const clip = liveClip([held(C3, 0), held(CS3, 0, { mute: 1 })]);

      handleNoteUpdates(
        clip,
        reasons,
        "G3 1|3",
        "C3: pitch += 1",
        undefined,
        4,
        4,
        ctx,
        undefined,
      );

      const notes = JSON.parse(
        clip.call("get_notes_extended", 0, 128, 0, 4) as string,
      ).notes as HeldNote[];

      expect(
        notes.filter((n) => n.pitch === CS3).map((n) => n.mute),
      ).toStrictEqual([0]);
    });

    it("says nothing about a note the call itself wrote there", () => {
      // The model asked for a note at that pitch and start: no surprise.
      expect(update([held(CS3, 0, { mute: 1 })], "C#3 1|1")).toBeUndefined();
    });

    it("says it for transforms alone, too", () => {
      applyTransformsToExistingNotes(
        liveClip([held(C3, 0), held(CS3, 0, { mute: 1 })]),
        reasons,
        undefined,
        "pitch += 1",
        4,
        4,
      );

      expect(reasons.said.get("123")).toStrictEqual([
        "replaced 1 muted note at the same pitch and start",
      ]);
    });

    it("says it for preTransforms, which also move existing notes", () => {
      handleNoteUpdates(
        liveClip([held(C3, 0), held(CS3, 0, { mute: 1 })]),
        reasons,
        "G3 1|3",
        undefined,
        "pitch += 1",
        4,
        4,
        ctx,
        undefined,
      );

      expect(reasons.said.get("123")).toStrictEqual([
        "replaced 1 muted note at the same pitch and start",
      ]);
    });
  });

  describe("overlapping notes at one pitch", () => {
    it("says a muted note shortened a new note", () => {
      // A half note E3 at 1|1 over a muted E3 at 1|2 comes out a quarter note
      const said = update([held(E3, 1, { mute: 1 })], "n/2 E3 1|1");

      expect(said).toBe("1 note shortened by an overlapping muted note");
    });

    it("says a new note shortened a muted note", () => {
      const said = update([held(E3, 0, { mute: 1, duration: 2 })], "E3 1|2");

      expect(said).toBe("1 muted note shortened by an overlapping note");
    });

    it("counts the notes cut", () => {
      const said = update(
        [held(E3, 1, { mute: 1 }), held(C3, 1, { mute: 1 })],
        "n/2 E3 1|1 C3 1|1",
      );

      expect(said).toBe("2 notes shortened by an overlapping muted note");
    });

    it("says nothing when the new note stops before the muted one", () => {
      expect(update([held(E3, 1, { mute: 1 })], "E3 1|1")).toBeUndefined();
    });

    it("says nothing when two visible notes overlap", () => {
      expect(update([held(E3, 1)], "n/2 E3 1|1")).toBeUndefined();
    });

    it("reads the clip back only when it holds muted notes", () => {
      const clip = liveClip([held(E3, 1)]);

      handleNoteUpdates(
        clip,
        reasons,
        "G3 1|3",
        undefined,
        undefined,
        4,
        4,
        ctx,
        undefined,
      );

      const reads = vi
        .mocked(clip.call)
        .mock.calls.filter(([method]) => method === "get_notes_extended");

      // One read before the write and one for the count
      expect(reads).toHaveLength(2);
    });

    it("joins what several effects say with a semicolon", () => {
      const said = update(
        [held(C3, 0), held(CS3, 0, { mute: 1 }), held(E3, 1, { mute: 1 })],
        "n/2 E3 1|1",
        "C3: pitch += 1",
      );

      expect(said).toBe(
        "replaced 1 muted note at the same pitch and start; 1 note shortened by an overlapping muted note",
      );
    });
  });
});

describe("updateClip quantize on a clip of only muted notes", () => {
  /**
   * A MIDI clip holding one muted E3 that quantize moves, or doesn't.
   * @param start - Where the muted note starts before quantizing
   * @returns The mocks
   */
  function mutedOnlyClip(start: number) {
    const mocks = setupUpdateClipMocks();
    let quantized = false;

    setupMidiClipMock(mocks.clip123);
    mocks.clip123.call.mockImplementation((method: string) => {
      if (method === "quantize") {
        quantized = true;
      }

      return method === "get_notes_extended"
        ? JSON.stringify({
            notes: [held(E3, quantized ? 2 : start, { mute: 1 })],
          })
        : {};
    });

    return mocks;
  }

  it("says what happened instead of reporting nothing", async () => {
    const mocks = mutedOnlyClip(2.1);
    const result = await updateClip({ id: "123", quantizeGrid: "1/4" });

    expect(mocks.clip123.call).toHaveBeenCalledWith("quantize", 1, 1);
    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      detail: "quantized 1 muted note",
    });
  });

  it("says nothing moved when the muted note was already on the grid", async () => {
    mutedOnlyClip(2);

    expect(await updateClip({ id: "123", quantizeGrid: "1/4" })).toStrictEqual({
      id: "123",
      path: "t0/s0",
      detail:
        "quantize moved nothing: the clip has only muted notes, and none moved",
    });
  });
});

describe("muted notes two passes each landed on", () => {
  it("sums the notes replaced across passes into one detail", () => {
    const reasons = newClipReasons();

    for (let pass = 0; pass < 2; pass++) {
      applyTransformsToExistingNotes(
        liveClip([held(C3, 0), held(CS3, 0, { mute: 1 })]),
        reasons,
        undefined,
        "pitch += 1",
        4,
        4,
      );
    }

    expect(reasons.said.get("123")).toStrictEqual([
      "replaced 2 muted notes at the same pitch and start",
    ]);
  });
});
