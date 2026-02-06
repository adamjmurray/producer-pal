// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiSet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { createClip } from "./create-clip.ts";
import { setupArrangementClipMocks } from "./create-clip-test-helpers.ts";

describe("createClip - arrangement view", () => {
  it("should create a single clip in arrangement", async () => {
    setupArrangementClipMocks();

    const result = await createClip({
      view: "arrangement",
      trackIndex: 0,
      arrangementStart: "3|1",
      notes: "C3 D3 E3 1|1",
      name: "Arrangement Clip",
    });

    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "create_midi_clip",
      8,
      4,
    ); // Length based on notes (1 bar in 4/4)
    expect(liveApiSet).toHaveBeenCalledWithThis(
      expect.objectContaining({ id: "arrangement_clip" }),
      "name",
      "Arrangement Clip",
    );

    expect(result).toStrictEqual({
      id: "arrangement_clip",
      trackIndex: 0,
      arrangementStart: "3|1",
      noteCount: 3,
      length: "1:0",
    });
  });

  it("should create arrangement clips at specified positions", async () => {
    setupArrangementClipMocks();

    const result = await createClip({
      view: "arrangement",
      trackIndex: 0,
      arrangementStart: "3|1,4|1,5|1", // Three explicit positions
      name: "Sequence",
      notes: "C3 1|1 D3 1|2",
    });

    // Clips should be created with exact length (4 beats = 1 bar in 4/4) at specified positions
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "create_midi_clip",
      8,
      4,
    ); // 3|1 = 8 beats
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "create_midi_clip",
      12,
      4,
    ); // 4|1 = 12 beats
    expect(liveApiCall).toHaveBeenCalledWithThis(
      expect.objectContaining({ path: "live_set tracks 0" }),
      "create_midi_clip",
      16,
      4,
    ); // 5|1 = 16 beats

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
    liveApiId.mockReturnValue("id 0");

    await expect(
      createClip({
        view: "arrangement",
        trackIndex: 99,
        arrangementStart: "3|1",
      }),
    ).rejects.toThrow("createClip failed: track 99 does not exist");
  });

  it("should emit warning and return empty array when arrangement clip creation fails", async () => {
    liveApiId.mockReturnValue("id 1");
    liveApiCall.mockReturnValue("id 999");

    // Mock the clip to not exist after creation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing mock LiveAPI on global
    const liveAPIGlobal = global as any;
    const originalExists = liveAPIGlobal.LiveAPI.prototype.exists;

    liveAPIGlobal.LiveAPI.prototype.exists = vi.fn(function (
      this: MockLiveAPIContext,
    ) {
      // Track exists, but clip doesn't
      return this._path === "live_set tracks 0";
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

    liveAPIGlobal.LiveAPI.prototype.exists = originalExists;
  });
});
