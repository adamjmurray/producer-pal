// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  mockMergeNoteTracking,
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

const NOTE = {
  pitch: 60,
  duration: 1,
  velocity: 100,
  probability: 1,
  velocity_deviation: 0,
};
const DROPPED = "dropped 1 duplicate note at the same pitch and start";

describe("updateClip - notes a transform collapses", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123, { length: 4 });
  });

  it("says so on the entry when a transform lands two notes on one slot", async () => {
    mockMergeNoteTracking(mocks.clip123, [
      { ...NOTE, start_time: 0 },
      { ...NOTE, start_time: 1 },
    ]);

    const result = await updateClip({ id: "123", transforms: "timing = 0" });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      noteCount: 1,
      transformed: 2,
      detail: DROPPED,
    });
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("says nothing when the transform collapses nothing", async () => {
    mockMergeNoteTracking(mocks.clip123, [{ ...NOTE, start_time: 0 }]);

    const result = await updateClip({ id: "123", transforms: "velocity = 50" });

    expect(result).not.toHaveProperty("detail");
  });

  it("counts what a transform collapses after new notes are merged in", async () => {
    mockMergeNoteTracking(mocks.clip123, [
      { ...NOTE, start_time: 0 },
      { ...NOTE, start_time: 1 },
    ]);

    const result = await updateClip({
      id: "123",
      notes: "C3 3|1",
      transforms: "timing = 0",
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        detail: "dropped 2 duplicate notes at the same pitch and start",
      }),
    );
  });

  it("stays quiet when new notes overwrite an existing note, as asked", async () => {
    mockMergeNoteTracking(mocks.clip123, [{ ...NOTE, start_time: 0 }]);

    const result = await updateClip({
      id: "123",
      notes: "C3 1|1",
      transforms: "velocity = 50",
    });

    expect(result).not.toHaveProperty("detail");
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("stays quiet when new notes overwrite an existing note and no transform runs", async () => {
    mockMergeNoteTracking(mocks.clip123, [{ ...NOTE, start_time: 0 }]);

    const result = await updateClip({ id: "123", notes: "C3 1|1" });

    expect(result).not.toHaveProperty("detail");
  });

  describe("Stark input", () => {
    const STARK = { notation: "stark" } as const;

    it("reports duplicates inside the input, with no transform", async () => {
      mockMergeNoteTracking(mocks.clip123, []);

      // kick and C1 both land on MIDI 36 at beat 0
      const result = await updateClip(
        { id: "123", notes: "kick: X\nC1: X" },
        STARK,
      );

      expect(result).toStrictEqual(
        expect.objectContaining({ detail: DROPPED }),
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("stays quiet when the input restates an existing note", async () => {
      mockMergeNoteTracking(mocks.clip123, [
        { ...NOTE, pitch: 36, start_time: 0 },
      ]);

      const result = await updateClip({ id: "123", notes: "kick: X" }, STARK);

      expect(result).not.toHaveProperty("detail");
    });

    it("counts input duplicates once when a transform runs too", async () => {
      mockMergeNoteTracking(mocks.clip123, []);

      const result = await updateClip(
        { id: "123", notes: "kick: X\nC1: X", transforms: "velocity = 50" },
        STARK,
      );

      expect(result).toStrictEqual(
        expect.objectContaining({ detail: DROPPED }),
      );
    });
  });
});
