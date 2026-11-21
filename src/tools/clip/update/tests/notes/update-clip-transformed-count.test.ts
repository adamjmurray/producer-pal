// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { type TransformOutcome } from "#src/notation/transform/transformed-count.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { newClipReasons } from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import {
  reportTransformsChangedNothing,
  type StagedTransforms,
} from "#src/tools/clip/update/helpers/notes/transform-no-change-report.ts";
import {
  mockMergeNoteTracking,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

const noteAt = (pitch: number, start_time: number) => ({
  pitch,
  start_time,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
});

// C3=60, D3=62; the two C3s are a beat apart, so repeat(n/4) lands the first's
// copy on the second.
const EXISTING = [noteAt(60, 0), noteAt(60, 1), noteAt(62, 2)];

// Changes both C3s, then echoes them: the copy at beat 1 replaces the original
// there when the write path dedupes, leaving three C3s written.
const REPEAT_COLLIDES = "C3: velocity += 10\nC3: repeat(n/4)";

// A note-dependent bad count is skipped with a warning at run time (a constant
// one is refused up front); it must not reset the earlier tally.
const SKIPPED_RATCHET =
  "C3: velocity += 10\nD3: velocity += 10\nC3: ratchet(rand(0, 0))";

// A successful op on other notes must not reset it either: 2 C3s + 2 D3 pieces.
const OP_ELSEWHERE = "C3: velocity += 10\nD3: ratchet(2)";

describe("updateClip - transform counts", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123, { length: 4 });
    mockMergeNoteTracking(
      mocks.clip123,
      EXISTING.map((n) => ({ ...n })),
    );
  });

  describe.each([
    ["transforms only", {}],
    ["notes and transforms", { notes: "E3 1|4" }],
  ])("%s", (_scenario, extraArgs) => {
    it.each([
      ["a collapsed duplicate counts once", REPEAT_COLLIDES, 3],
      ["a skipped note op keeps earlier lines' notes", SKIPPED_RATCHET, 3],
      ["a note op elsewhere keeps earlier lines' notes", OP_ELSEWHERE, 4],
    ])("%s", async (_name, transforms, transformed) => {
      const result = await updateClip({ id: "123", ...extraArgs, transforms });

      expect(result).toStrictEqual(expect.objectContaining({ transformed }));
    });
  });

  // Both stages count: a note either one changed counts once, and a note
  // preTransforms deleted is reported as deleted.
  describe.each([
    ["transforms only", undefined],
    ["notes and transforms", "E3 1|4"],
  ])("preTransforms and transforms: %s", (_name, notes) => {
    it.each([
      [
        "different notes both count",
        "C3: velocity += 10",
        "D3: velocity += 10",
        { transformed: 3 },
      ],
      [
        "a note changed by both counts once",
        "C3: velocity += 10",
        "C3-D3: velocity += 10",
        { transformed: 3 },
      ],
      [
        "a copy preTransforms made counts when transforms changes nothing",
        "D3: repeat(n/4)",
        "velocity = 100",
        { transformed: 1 },
      ],
      [
        "ratchet pieces count when transforms changes nothing",
        "D3: ratchet(2)",
        "D3: velocity = 100",
        { transformed: 2 },
      ],
      [
        "a copy and a note transforms changed both count",
        "D3: repeat(n/4)",
        "C3: velocity += 10",
        { transformed: 3 },
      ],
      [
        "a note preTransforms deleted counts as deleted",
        "C3: velocity = 0",
        "D3: velocity += 10",
        { transformed: 1, deletedNotes: 2 },
      ],
    ])("%s", async (_case, preTransforms, transforms, counts) => {
      const result = await updateClip({
        id: "123",
        notes,
        preTransforms,
        transforms,
      });

      // The two C3s and the D3 in every case
      expect(result).toStrictEqual(expect.objectContaining(counts));
    });
  });

  describe.each([
    ["transforms only", {}],
    ["notes and transforms", { notes: "E3 1|4" }],
  ])("a transform that changes nothing: %s", (_scenario, extraArgs) => {
    it("reports transformed 0 and no deletedNotes", async () => {
      const result = (await updateClip({
        id: "123",
        ...extraArgs,
        transforms: "velocity += 0",
      })) as object;

      expect(result).toStrictEqual(expect.objectContaining({ transformed: 0 }));
      expect(result).not.toHaveProperty("deletedNotes");
    });

    it("reports deleted notes apart from changed ones", async () => {
      const result = await updateClip({
        id: "123",
        ...extraArgs,
        transforms: "C3: velocity = 0\nD3: velocity += 10",
      });

      expect(result).toStrictEqual(
        expect.objectContaining({ transformed: 1, deletedNotes: 2 }),
      );
      expect(result).toHaveProperty("noteCount");
    });
  });

  describe.each([
    ["transforms only", {}, 3],
    // The new note joins the notes the transforms see
    ["notes and transforms", { notes: "E3 1|4" }, 4],
  ])(
    "what a transform that changes nothing says: %s",
    (_scenario, extraArgs, noteCount) => {
      it("says the transforms left the matched notes as they were", async () => {
        const result = await updateClip({
          id: "123",
          ...extraArgs,
          transforms: "velocity += 0",
        });

        expect(result).toStrictEqual(
          expect.objectContaining({
            transformed: 0,
            detail: `the transforms changed none of the ${noteCount} matched notes`,
          }),
        );
      });

      it.each([
        ["merge", "D3: merge()"],
        ["split", "D3: split(9|1)"],
        ["ratchet", "D3: ratchet(n/4)"],
      ])(
        "doesn't call a %s that changed nothing an expression",
        async (_name, transforms) => {
          const result = await updateClip({
            id: "123",
            ...extraArgs,
            transforms,
          });

          expect(result).toStrictEqual(
            expect.objectContaining({
              transformed: 0,
              detail: expect.stringContaining(
                "the transforms didn't change the 1 matched note",
              ),
            }),
          );
        },
      );

      it("says when the selector matched no notes", async () => {
        const result = await updateClip({
          id: "123",
          ...extraArgs,
          transforms: "G5: velocity += 10",
        });

        expect(result).toStrictEqual(
          expect.objectContaining({
            transformed: 0,
            detail: "no notes matched the selector",
          }),
        );
      });

      it("counts only the notes the selector matched", async () => {
        const result = await updateClip({
          id: "123",
          ...extraArgs,
          transforms: "D3: velocity += 0",
        });

        expect(result).toStrictEqual(
          expect.objectContaining({
            detail: "the transforms didn't change the 1 matched note",
          }),
        );
      });

      // The failure has its own detail; neither claim would be true
      it.each([
        ["an expression that fails", "velocity = audio.gain"],
        ["a skipped note op", "G5: velocity += 10\nC3: ratchet(rand(0, 0))"],
      ])("doesn't call %s a no-op or a miss", async (_name, transforms) => {
        const result = (await updateClip({
          id: "123",
          ...extraArgs,
          transforms,
        })) as { detail?: string };

        expect(result.detail ?? "").not.toMatch(
          /changed none|no notes matched/,
        );
      });

      it("says nothing when a note changed", async () => {
        const result = await updateClip({
          id: "123",
          ...extraArgs,
          transforms: "D3: velocity += 10",
        });

        expect(result).toStrictEqual(
          expect.objectContaining({ transformed: 1 }),
        );
        expect(result).not.toHaveProperty("detail");
      });

      it("says nothing when the matched notes were deleted", async () => {
        const result = await updateClip({
          id: "123",
          ...extraArgs,
          transforms: "C3: velocity = 0",
        });

        expect(result).toStrictEqual(
          expect.objectContaining({ transformed: 0, deletedNotes: 2 }),
        );
        expect(result).not.toHaveProperty("detail");
      });
    },
  );

  it("judges preTransforms and transforms together", async () => {
    const changedByPre = await updateClip({
      id: "123",
      preTransforms: "D3: velocity += 10",
      transforms: "velocity += 0",
    });

    expect(changedByPre).toStrictEqual(
      expect.objectContaining({ transformed: 1 }),
    );
    expect(changedByPre).not.toHaveProperty("detail");

    const neitherChanged = await updateClip({
      id: "123",
      preTransforms: "velocity += 0",
      transforms: "G5: velocity += 10",
    });

    expect(neitherChanged).toStrictEqual(
      expect.objectContaining({
        transformed: 0,
        detail: "the transforms changed none of the 3 matched notes",
      }),
    );
  });

  it("reports on preTransforms alone", async () => {
    const result = await updateClip({
      id: "123",
      preTransforms: "G5: velocity += 10",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        transformed: 0,
        detail: "no notes matched the selector",
      }),
    );
  });
});

function outcome(matchedCount: number, selected: boolean): TransformOutcome {
  const matched = new Set<NoteEvent>();

  for (let pitch = 60; pitch < 60 + matchedCount; pitch++) {
    matched.add({ pitch, start_time: 0, duration: 1, velocity: 100 });
  }

  return {
    changed: new Set(),
    deleted: [],
    original: new Map(),
    roots: new Map(),
    matched,
    selected,
    failed: false,
  };
}

describe("reportTransformsChangedNothing", () => {
  it("judges by the earlier stage when it matched more and the later one selected nothing", () => {
    const reasons = newClipReasons();
    const staged: StagedTransforms = { defer: true };

    reportTransformsChangedNothing(
      reasons,
      "clip-1",
      outcome(3, true),
      { transformed: 0 },
      staged,
    );
    staged.defer = false;
    reportTransformsChangedNothing(
      reasons,
      "clip-1",
      outcome(0, false),
      { transformed: 0 },
      staged,
    );

    expect(reasons.said.get("clip-1")).toStrictEqual([
      "the transforms changed none of the 3 matched notes",
    ]);
  });
});
