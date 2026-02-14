// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/test/helpers/live-api-path-builders.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createClip } from "./create-clip.ts";
import { setupArrangementClipMocks } from "./create-clip-test-helpers.ts";

describe("createClip - arrangement view", () => {
  it("should create a single clip in arrangement", async () => {
    const { track, clip } = setupArrangementClipMocks();

    const result = await createClip({
      view: "arrangement",
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
      length: "1:0",
    });
  });

  it("should create arrangement clips at specified positions", async () => {
    const { track } = setupArrangementClipMocks();

    const result = await createClip({
      view: "arrangement",
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
        length: "1:0",
      },
      {
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "4|1",
        noteCount: 2,
        length: "1:0",
      },
      {
        id: "arrangement_clip",
        trackIndex: 0,
        arrangementStart: "5|1",
        noteCount: 2,
        length: "1:0",
      },
    ]);
  });

  it("should throw error when track doesn't exist", async () => {
    mockNonExistentObjects();

    await expect(
      createClip({
        view: "arrangement",
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
      view: "arrangement",
      trackIndex: 0,
      arrangementStart: "1|1",
      notes: "C4 1|1",
    });

    // Should return empty array (no clips created)
    expect(result).toStrictEqual([]);
  });
});
