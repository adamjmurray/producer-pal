// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createNote } from "#src/test/test-data-builders.ts";
import { createClip } from "../create-clip.ts";
import { setupArrangementClipMocks } from "./create-clip-test-helpers.ts";

describe("createClip - arrangement view", () => {
  it("should create a single clip in arrangement", async () => {
    const { track, clip } = setupArrangementClipMocks();

    const result = await createClip({
      trackIndex: 0,
      arrangementStart: "3|1",
      notes: "C3 D3 E3 1|1",
      name: "Arrangement Clip",
    });

    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 4); // Length based on notes (1 bar in 4/4)
    expect(clip.set).toHaveBeenCalledWith("name", "Arrangement Clip");

    expect(result).toStrictEqual({
      id: "arrangement_clip",
      trackIndex: 0,
      arrangementStart: "3|1",
      noteCount: 3,
      length: "1bar",
    });
  });

  it("rejects a 0-indexed arrangementStart with the 1-indexing steer", async () => {
    setupArrangementClipMocks();

    // arrangementStart is converted per-position in the create loop; a
    // 0-indexed/zero-bar position is a hard error there, not a silent pre-origin
    // beat. Also covers the per-item check in a comma-separated list.
    await expect(
      createClip({ trackIndex: 0, arrangementStart: "1|0", notes: "C3 1|1" }),
    ).rejects.toThrow(/1-indexed/);
    await expect(
      createClip({
        trackIndex: 0,
        arrangementStart: "3|1,0|1",
        notes: "C3 1|1",
      }),
    ).rejects.toThrow(/1-indexed/);
  });

  it("should create arrangement clips at specified positions", async () => {
    const { track } = setupArrangementClipMocks();

    const result = await createClip({
      trackIndex: 0,
      arrangementStart: "3|1,4|1,5|1", // Three explicit positions
      name: "Sequence",
      notes: "C3 1|1 D3 1|2",
    });

    // Clips should be created with exact length (4 beats = 1 bar in 4/4) at specified positions
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 4); // 3|1 = 8 beats
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 12, 4); // 4|1 = 12 beats
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 16, 4); // 5|1 = 16 beats

    expect(result).toStrictEqual([
      {
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "3|1",
        noteCount: 2,
        length: "1bar",
      },
      {
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "4|1",
        noteCount: 2,
        length: "1bar",
      },
      {
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "5|1",
        noteCount: 2,
        length: "1bar",
      },
    ]);
  });

  it("should throw error when track doesn't exist", async () => {
    mockNonExistentObjects();

    await expect(
      createClip({
        trackIndex: 99,
        arrangementStart: "3|1",
      }),
    ).rejects.toThrow("createClip failed: track 99 does not exist");
  });

  it("should emit warning and return empty array when arrangement clip creation fails", async () => {
    mockNonExistentObjects();

    registerMockObject("track-0", {
      path: livePath.track(0),
      methods: {
        create_midi_clip: vi.fn(() => ["id", "missing-arrangement-clip"]),
      },
    });

    // Runtime errors during clip creation are now warnings, not fatal errors
    const result = await createClip({
      trackIndex: 0,
      arrangementStart: "1|1",
      notes: "C4 1|1",
    });

    // Should return empty array (no clips created)
    expect(result).toStrictEqual([]);
  });

  it("should throw when arrangementStart is provided without trackIndex", async () => {
    await expect(
      createClip({
        arrangementStart: "1|1",
        notes: "C4 1|1",
      }),
    ).rejects.toThrow("trackIndex is required for arrangement clips");
  });

  it("cycles clipseq() by clip.index across arrangement positions", async () => {
    const { track, clip } = setupArrangementClipMocks();

    await createClip({
      trackIndex: 0,
      arrangementStart: "1|1,2|1,3|1",
      notes: "C3 1|1",
      transforms: "velocity = clipseq(11, 22, 33)",
    });

    // All three positions resolve to the same mock clip, so inspect each
    // add_new_notes payload: the velocity cycles by clip.index per position.
    const addNotesPayloads = clip.call.mock.calls
      .filter((call: unknown[]) => call[0] === "add_new_notes")
      .map((call: unknown[]) => call[1]);

    expect(addNotesPayloads).toStrictEqual([
      { notes: [createNote({ velocity: 11 })] },
      { notes: [createNote({ velocity: 22 })] },
      { notes: [createNote({ velocity: 33 })] },
    ]);

    // create_midi_clip still receives the per-position arrangement start
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 0, 4);
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 4, 4);
    expect(track.call).toHaveBeenCalledWith("create_midi_clip", 8, 4);
  });
});
