// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
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

// Touches both C3s, then echoes them: the copy at beat 1 replaces the original
// there when the write path dedupes, leaving three C3s written.
const REPEAT_COLLIDES = "C3: velocity += 0\nC3: repeat(n/4)";

// A note-dependent bad count is skipped with a warning at run time (a constant
// one is refused up front); it must not reset the earlier tally.
const SKIPPED_RATCHET =
  "C3: velocity += 0\nD3: velocity += 0\nC3: ratchet(rand(0, 0))";

// A successful op on other notes must not reset it either: 2 C3s + 2 D3 pieces.
const OP_ELSEWHERE = "C3: velocity += 0\nD3: ratchet(2)";

describe("updateClip - transformed count", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123, { length: 4 });
    mockMergeNoteTracking(
      mocks.clip123,
      EXISTING.map((n) => ({ ...n })),
    );
  });

  describe("transforms only", () => {
    it.each([
      ["a collapsed duplicate counts once", REPEAT_COLLIDES, 3],
      ["a skipped note op keeps earlier lines' notes", SKIPPED_RATCHET, 3],
      ["a note op elsewhere keeps earlier lines' notes", OP_ELSEWHERE, 4],
    ])("%s", async (_name, transforms, transformed) => {
      const result = await updateClip({ id: "123", transforms });

      expect(result).toStrictEqual(expect.objectContaining({ transformed }));
    });
  });

  describe("notes and transforms", () => {
    it.each([
      ["a collapsed duplicate counts once", REPEAT_COLLIDES, 3],
      ["a skipped note op keeps earlier lines' notes", SKIPPED_RATCHET, 3],
      ["a note op elsewhere keeps earlier lines' notes", OP_ELSEWHERE, 4],
    ])("%s", async (_name, transforms, transformed) => {
      const result = await updateClip({
        id: "123",
        notes: "E3 1|4",
        transforms,
      });

      expect(result).toStrictEqual(expect.objectContaining({ transformed }));
    });
  });

  // Both stages count: a note either one touched counts once, and a note
  // preTransforms deleted still counts.
  describe.each([
    ["transforms only", undefined],
    ["notes and transforms", "E3 1|4"],
  ])("preTransforms and transforms: %s", (_name, notes) => {
    it.each([
      ["different notes both count", "C3: velocity += 0", "D3: velocity += 0"],
      [
        "a note touched by both counts once",
        "C3: velocity += 0",
        "C3-D3: velocity += 0",
      ],
      [
        "a note preTransforms deleted still counts",
        "C3: velocity = 0",
        "D3: velocity += 0",
      ],
    ])("%s", async (_case, preTransforms, transforms) => {
      const result = await updateClip({
        id: "123",
        notes,
        preTransforms,
        transforms,
      });

      // 2 C3 + 1 D3 in every case
      expect(result).toStrictEqual(expect.objectContaining({ transformed: 3 }));
    });
  });
});
