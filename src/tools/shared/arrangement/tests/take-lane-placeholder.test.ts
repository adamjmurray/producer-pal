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
 * How a warning names the clip: both spellings, per ADR-0009. It starts at 0,
 * which the song's 4/4 spells as bar 1 beat 1.
 */
const CLIP = `t0/l1[1|1] (id ${CLIP_ID})`;

/**
 * Register a clip at the given path and hand it back.
 * @param path - The clip's Live path
 * @param isMidi - 1 for a MIDI clip, 0 for audio
 * @param name - The clip's name, or null for one Live won't report
 * @returns The clip LiveAPI
 */
function registerClip(
  path: PathLike,
  isMidi: number,
  name: string | null = "Take",
): LiveAPI {
  mockNonExistentObjects();
  registerMockObject(CLIP_ID, {
    path,
    type: "Clip",
    properties: { is_midi_clip: isMidi, length: 8, name },
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
      `clip ${CLIP} was emptied instead of deleted: Live's API can't remove a clip from a take lane. A muted "(moved) Take" was left there — delete it in Live's UI`,
    );
  });

  // Emptying a clip that is already a placeholder would otherwise read
  // "(moved) (moved) Take", in the name and in the warning.
  it.each([
    ["(moved) Take", "(moved) Take"],
    ["(moved)", "(moved)"],
    ["", "(moved)"],
    // Only a leading prefix counts.
    ["a (moved) take", "(moved) a (moved) take"],
  ])("marks a take named %o as %o", (name, expected) => {
    const clip = registerClip(
      livePath.track(0).takeLane(1).arrangementClip(0),
      1,
      name,
    );

    emptyTakeLaneClip(clip);

    expect(clip.set).toHaveBeenCalledWith("name", expected);
    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining(`A muted "${expected}" was left there`),
    );
  });

  // Emptying runs after the destination copy is committed, so a throw on a
  // name Live doesn't report would strand that copy.
  it("marks a take whose name Live doesn't report", () => {
    const clip = registerClip(
      livePath.track(0).takeLane(1).arrangementClip(0),
      1,
      null,
    );

    emptyTakeLaneClip(clip);

    expect(clip.set).toHaveBeenCalledWith("name", "(moved)");
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
        `clip ${CLIP} was muted instead of deleted: Live's API can't remove a clip from a take lane, and an audio clip's sample can't be cleared`,
      ),
    );
  });
});
