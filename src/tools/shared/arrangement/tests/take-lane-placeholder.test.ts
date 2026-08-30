// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { emptyTakeLaneClip } from "../helpers/take-lane-placeholder.ts";
import { takeLaneIndexOfClip } from "../helpers/take-lane-helpers.ts";

const CLIP_ID = "42";

/**
 * Register a clip at the given path and hand it back.
 * @param path - The clip's Live path
 * @param isMidi - 1 for a MIDI clip, 0 for audio
 * @returns The clip LiveAPI
 */
function registerClip(path: PathLike, isMidi: number): LiveAPI {
  mockNonExistentObjects();
  registerMockObject(CLIP_ID, {
    path,
    type: "Clip",
    properties: { is_midi_clip: isMidi, length: 8, name: "Take" },
    methods: { get_notes_extended: () => JSON.stringify({ notes: [] }) },
  });

  return LiveAPI.from(`id ${CLIP_ID}`);
}

describe("take-lane placeholders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the lane a clip sits on, and null for a main-lane clip", () => {
    mockNonExistentObjects();
    registerMockObject("a", {
      path: livePath.track(2).takeLane(3).arrangementClip(0),
    });
    registerMockObject("b", { path: livePath.track(2).arrangementClip(0) });

    expect(takeLaneIndexOfClip(LiveAPI.from("id a"))).toBe(3);
    expect(takeLaneIndexOfClip(LiveAPI.from("id b"))).toBeNull();
  });

  it("strips a MIDI take's notes, mutes it, and marks it", () => {
    const clip = registerClip(
      livePath.track(0).takeLane(1).arrangementClip(0),
      1,
    );

    emptyTakeLaneClip(clip);

    expect(clip.call).toHaveBeenCalledWith(
      "remove_notes_extended",
      0,
      128,
      -8,
      24,
    );
    expect(clip.set).toHaveBeenCalledWith("name", "(moved) Take");
    expect(clip.set).toHaveBeenCalledWith("muted", 1);
    expect(capturedWarnings()).toContain(
      `clip ${CLIP_ID} was emptied instead of deleted: Live's API can't remove a clip from a take lane. A muted "(moved) Take" was left on t0/l1 — delete it in Live's UI`,
    );
  });

  // An audio clip's sample can't be cleared and a silent clip can't be
  // stretched over it, so muting is all that's left.
  it("only mutes and marks an audio take, and says so", () => {
    const clip = registerClip(
      livePath.track(0).takeLane(1).arrangementClip(0),
      0,
    );

    emptyTakeLaneClip(clip);

    expect(clip.call).not.toHaveBeenCalledWith(
      "remove_notes_extended",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(clip.set).toHaveBeenCalledWith("muted", 1);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(
        `clip ${CLIP_ID} was muted instead of deleted: Live's API can't remove a clip from a take lane, and an audio clip's sample can't be cleared`,
      ),
    );
  });
});
