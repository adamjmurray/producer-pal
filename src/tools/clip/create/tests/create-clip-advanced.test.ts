// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import * as v8Console from "#src/shared/v8-max-console.ts";
import { setupSelectMock } from "#src/test/focus-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  overrideCall,
  USE_CALL_FALLBACK,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createClip } from "../create-clip.ts";
import {
  expectClipCreated,
  expectNotesAdded,
  note,
  setupArrangementClipMocks,
  setupDualMocks,
  setupSessionMocks,
} from "./create-clip-test-helpers.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

// Registers an empty clip slot (and its clip path) at track 0, the given scene.
function registerEmptyClipSlot(sceneIndex: number): void {
  registerMockObject(`live_set/tracks/0/clip_slots/${sceneIndex}`, {
    path: livePath.track(0).clipSlot(sceneIndex),
    properties: { has_clip: 0 },
  });
  registerMockObject(`live_set/tracks/0/clip_slots/${sceneIndex}/clip`, {
    path: livePath.track(0).clipSlot(sceneIndex).clip(),
  });
}

describe("createClip - advanced features", () => {
  it("should set time signature when provided", async () => {
    const { clip } = setupSessionMocks({
      liveSet: {
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    const result = await createClip({
      slot: "0/0",
      timeSignature: "6/8",
    });

    expect(clip.set).toHaveBeenCalledWith("signature_numerator", 6);
    expect(clip.set).toHaveBeenCalledWith("signature_denominator", 8);
    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      slot: "0/0",
    });
  });

  it("should calculate correct clip length based on note start position", async () => {
    const { clipSlot } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
      notes: "n/2 C3 1|1 n3/4 D3 1|3", // Last note starts at beat 2 (0-based), rounds up to 1 bar = 4 beats
    });

    expectClipCreated(clipSlot, 4);
  });

  it("should return single object for single position and array for multiple positions", async () => {
    setupSessionMocks({
      liveSet: { signature_numerator: 4 },
    });
    registerEmptyClipSlot(1);
    registerEmptyClipSlot(2);

    const singleResult = await createClip({
      slot: "0/0",
      name: "Single",
    });

    const arrayResult = await createClip({
      slot: "0/1,0/2",
      name: "Multiple",
    });

    expect(singleResult).toMatchObject({
      id: expect.any(String),
      slot: "0/0",
    });
    expect((singleResult as { length?: unknown }).length).toBeUndefined();

    expect(Array.isArray(arrayResult)).toBe(true);
    expect(arrayResult).toHaveLength(2);
    expect((arrayResult as object[])[0]).toStrictEqual({
      id: expect.any(String),
      slot: "0/1",
    });
    expect((arrayResult as object[])[1]).toStrictEqual({
      id: expect.any(String),
      slot: "0/2",
    });
  });

  it("should filter out v0 notes when creating clips", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    const result = await createClip({
      slot: "0/0",
      notes: "v100 C3 v0 D3 v80 E3 1|1", // D3 should be filtered out
    });

    expectNotesAdded(clip, [note(60, 0, 1), note(64, 0, 1, 80)]);

    expect(result).toStrictEqual({
      id: "live_set/tracks/0/clip_slots/0/clip",
      slot: "0/0",
      noteCount: 2,
      length: "1bar",
    }); // C3 and E3, D3 filtered out
  });

  it("should handle clips with all v0 notes filtered out", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
      notes: "v0 C3 D3 E3 1|1", // All notes should be filtered out
    });

    expect(clip.call).not.toHaveBeenCalledWith(
      "add_new_notes",
      expect.anything(),
    );
  });

  it("should set start and firstStart when provided", async () => {
    const { clip } = setupSessionMocks({
      liveSet: { signature_numerator: 4, signature_denominator: 4 },
    });

    await createClip({
      slot: "0/0",
      name: "Test Clip",
      notes: "C3 D3",
      start: "1|3",
      firstStart: "1|2",
    });

    // start "1|3" converts to 2 beats (bar 1, beat 3)
    expect(clip.set).toHaveBeenCalledWith("start_marker", 2);
    expect(clip.set).toHaveBeenCalledWith("loop_start", 2);
  });

  describe("focus functionality", () => {
    const selectMockRef = setupSelectMock();

    it("should select session clip and show clip detail when focus=true", async () => {
      setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      await createClip({
        slot: "0/0",
        focus: true,
      });

      expect(selectMockRef.get()).toHaveBeenCalledWith({
        clipId: "live_set/tracks/0/clip_slots/0/clip",
        detailView: "clip",
      });
    });

    it("should select arrangement clip and show clip detail when focus=true", async () => {
      setupArrangementClipMocks();

      await createClip({
        trackIndex: 0,
        arrangementStart: "1|1",
        focus: true,
      });

      expect(selectMockRef.get()).toHaveBeenCalledWith({
        clipId: "arrangement_clip",
        detailView: "clip",
      });
    });

    it("should not call select when focus=false", async () => {
      setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      await createClip({
        slot: "0/0",
        focus: false,
      });

      expect(selectMockRef.get()).not.toHaveBeenCalled();
    });

    it("should focus last clip when creating multiple clips with focus=true", async () => {
      setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
      });
      registerEmptyClipSlot(1);

      const result = await createClip({
        slot: "0/0,0/1",
        focus: true,
      });

      expect(selectMockRef.get()).toHaveBeenCalledWith({
        clipId: "live_set/tracks/0/clip_slots/1/clip",
        detailView: "clip",
      });
      expect(selectMockRef.get()).toHaveBeenCalledTimes(1);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it("should focus arrangement clip when both session and arrangement are specified", async () => {
      setupDualMocks();

      await createClip({
        slot: "0/0",
        trackIndex: 0,
        arrangementStart: "1|1",
        focus: true,
      });

      // Arrangement clip gets focus priority over session clip
      expect(selectMockRef.get()).toHaveBeenCalledWith({
        clipId: "arrangement_clip",
        detailView: "clip",
      });
      expect(selectMockRef.get()).toHaveBeenCalledTimes(1);
    });
  });

  describe("dual session and arrangement creation", () => {
    it("should create clips in both session and arrangement", async () => {
      setupDualMocks();

      const result = await createClip({
        slot: "0/0",
        trackIndex: 0,
        arrangementStart: "1|1",
      });

      expect(Array.isArray(result)).toBe(true);
      const clips = result as object[];

      expect(clips).toHaveLength(2);
      expect(clips[0]).toStrictEqual({
        id: "live_set/tracks/0/clip_slots/0/clip",
        slot: "0/0",
      });
      expect(clips[1]).toStrictEqual({
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "1|1",
      });
    });

    it("spans clip.index/clip.count across the full session+arrangement batch", async () => {
      const { sessionClip, arrangementClip } = setupDualMocks();

      await createClip({
        slot: "0/0",
        trackIndex: 0,
        arrangementStart: "1|1",
        notes: "C3 1|1",
        transforms: "velocity = clip.index * 10 + clip.count",
      });

      // The batch is 2 clips (1 session + 1 arrangement), so clip.count is 2 for
      // both and the index spans the whole batch: session is index 0,
      // arrangement index 1. Before the fix each view restarted at index 0 with
      // its own per-view count of 1, so both clips got velocity 0*10 + 1 = 1.
      expectNotesAdded(sessionClip, [note(60, 0, 1, 2)]); // 0*10 + 2
      expectNotesAdded(arrangementClip, [note(60, 0, 1, 12)]); // 1*10 + 2
    });
  });

  describe("note ordering and count", () => {
    it("sorts notes ascending by start_time before add_new_notes", async () => {
      // Authored out of order: 1|3 (start 2) precedes 1|2.5 (start 1.5). Writing
      // them as authored would let the later beat-2.5 note overlap the beat-3
      // onset and make Live delete it. Sorting first leaves only a tail overlap.
      const { clip } = setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      await createClip({
        slot: "0/0",
        notes: "n/4 C1 1|3 1|2.5",
      });

      expectNotesAdded(clip, [
        note(36, 1.5, 1), // 1|2.5 written first after the sort
        note(36, 2, 1), // 1|3 second
      ]);
    });

    it("dedupes same-pitch+exact-onset collisions a transform produces", async () => {
      // C3 at 1|1 (start 0) and 1|2 (start 1). repeat(n/4) echoes each note one
      // beat later, so the echo of the beat-0 note lands exactly on the beat-1
      // note: two C3s at start 1. Without dedupe both are written and Live's
      // add_new_notes drops one nondeterministically; dedupe collapses them to a
      // single note (keeping last), matching the update and merge write paths.
      const { clip } = setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      await createClip({
        slot: "0/0",
        notes: "C3 1|1 1|2",
        transforms: "repeat(n/4)",
      });

      expectNotesAdded(clip, [
        note(60, 0, 1), // original beat 0
        note(60, 1, 1), // collision at beat 1 collapsed to one note
        note(60, 2, 1), // echo of the beat-1 note
      ]);
    });

    it("dedupes same-pitch+start duplicates on the no-transform path and warns", async () => {
      // Two identical p:60,t:0 notes, no transform. The create path only sorted
      // before, so both reached add_new_notes and Live silently dropped one. The
      // dedupe collapses them keep-last and warns so the LLM sees the drop.
      const warn = vi.spyOn(v8Console, "warn").mockImplementation(() => {});
      const { clip } = setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
      });

      await createClip(
        {
          slot: "0/0",
          notes:
            '[{"pitch":60,"start":0,"duration":1,"velocity":100},{"pitch":60,"start":0,"duration":1,"velocity":100}]',
        },
        { notation: "midi-json" },
      );

      expectNotesAdded(clip, [note(60, 0, 1)]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Dropped 1 duplicate note"),
      );
    });

    it("reports the actual stored note count, not the interpreted input count", async () => {
      const { clip } = setupSessionMocks({
        liveSet: { signature_numerator: 4, signature_denominator: 4 },
        clip: { length: 4 },
      });

      // Simulate Live dropping a note during add_new_notes: 3 interpreted, 2 stored.
      overrideCall(clip, (method) =>
        method === "get_notes_extended"
          ? JSON.stringify({ notes: [{}, {}] })
          : USE_CALL_FALLBACK,
      );

      const result = await createClip({
        slot: "0/0",
        notes: "C1 D1 E1 1|1",
      });

      expect(result).toMatchObject({ noteCount: 2 });
    });
  });
});
