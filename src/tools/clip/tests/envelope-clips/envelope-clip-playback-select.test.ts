// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-playback and ppal-select on Live 13 return-track envelope clips, and
// create-clip, which can never make one.

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import { playback } from "#src/tools/session/playback.ts";
import { select } from "#src/tools/session/select.ts";
import {
  clipSlotReadsOnReturns,
  registerRegularClip,
} from "./envelope-clip-test-helpers.ts";
import {
  NO_ENVS_BY_PATH_OR_ID,
  noteOrAudioTouches,
  registerWritableEnvelopeWorld,
  resetWritableEnvelopeWorld,
  type WritableEnvelopeWorld,
} from "./envelope-write-test-helpers.ts";

const NEEDS_13 = "return-track clips need Live 13";

describe("ppal-playback - envelope clips", () => {
  let world: WritableEnvelopeWorld;

  beforeEach(() => {
    world = resetWritableEnvelopeWorld();
  });

  it.each(NO_ENVS_BY_PATH_OR_ID)(
    "launches a clip named by %s",
    (_how, target) => {
      const result = playback({ action: "play-session-clips", ...target });

      expect(result.playing).toBe(true);
      expect(result.clip).toStrictEqual({ id: "no-envs", path: "rt0/s0" });
      expect(world.slots[0]?.[0]?.call).toHaveBeenCalledWith("fire");
      expect(noteOrAudioTouches(world)).toStrictEqual([]);
    },
  );

  // The slot's own stop can't cancel a queued launch; the track's can.
  it.each([
    ["path", { path: "rt1/s0" }],
    ["id", { id: "with-env" }],
  ])("stops a clip named by %s through its return track", (_how, target) => {
    const result = playback({ action: "stop-session-clips", ...target });

    expect(result.clip).toStrictEqual({ id: "with-env", path: "rt1/s0" });
    expect(world.returnTracks[1]?.call).toHaveBeenCalledWith("stop_all_clips");
    expect(world.slots[1]?.[0]?.call).not.toHaveBeenCalledWith("stop");
  });

  it("launches clips on both return tracks beside a regular clip", () => {
    registerRegularClip();
    registerMockObject("t0s0", {
      path: livePath.track(0).clipSlot(0),
      properties: { has_clip: 1 },
    });

    const result = playback({
      action: "play-session-clips",
      path: "t0/s0,rt0/s0",
      id: "with-env",
    });

    expect(result.clip).toStrictEqual([
      { id: "with-env", path: "rt1/s0" },
      { id: "regular", path: "t0/s0" },
      { id: "no-envs", path: "rt0/s0" },
    ]);
  });

  it("skips an empty return track slot, as it does any empty slot", () => {
    expect(() =>
      playback({ action: "play-session-clips", path: "rt0/s2" }),
    ).toThrow("no clip to play");
    expect(world.slots[0]?.[2]?.call).not.toHaveBeenCalledWith("fire");
  });

  it("reports the clips launched before one that throws", () => {
    const second = world.slots[1]?.[0];

    if (second != null) {
      second.methods.fire = () => {
        throw new Error("Live refused to launch");
      };
    }

    const result = playback({
      action: "play-session-clips",
      path: "rt0/s0,rt1/s0",
    });

    expect(result.clip).toStrictEqual([
      { id: "no-envs", path: "rt0/s0" },
      expect.objectContaining({ path: "rt1/s0", ok: false }),
    ]);
  });

  it.each([
    ["path", { path: "rt0/s2" }],
    ["id", { id: "no-envs" }],
  ])("plays the scene a clip or slot named by %s sits in", (_how, target) => {
    const scene = _how === "id" ? 0 : 2;
    const result = playback({ action: "play-scene", ...target });

    expect(result.scene).toStrictEqual(
      expect.objectContaining({ path: `s${scene}` }),
    );
    expect(result.playing).toBe(true);
  });

  it("refuses a return-track slot on Live 12, saying so, and reads no slot", () => {
    const live12 = resetWritableEnvelopeWorld("12.4.15");

    expect(() =>
      playback({ action: "play-session-clips", path: "rt0/s0" }),
    ).toThrow(NEEDS_13);
    expect(() => playback({ action: "play-scene", path: "rt0/s1" })).toThrow(
      NEEDS_13,
    );
    expect(clipSlotReadsOnReturns(live12)).toStrictEqual([]);
  });
});

describe("ppal-select - envelope clips", () => {
  let world: WritableEnvelopeWorld;

  beforeEach(() => {
    world = resetWritableEnvelopeWorld();
  });

  it("selects a clip named by path, highlighting its slot, in session view", () => {
    const songView = registerMockObject("song-view", {
      path: livePath.view.song,
    });
    const appView = registerMockObject("app-view", { path: livePath.view.app });

    const result = select({ path: "rt0/s0" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        view: "session",
        selectedClip: { id: "no-envs", path: "rt0/s0" },
      }),
    );
    expect(songView.set).toHaveBeenCalledWith(
      "highlighted_clip_slot",
      "id r0s0",
    );
    expect(songView.set).toHaveBeenCalledWith("detail_clip", "id no-envs");
    expect(appView.call).toHaveBeenCalledWith("show_view", "Session");
    expect(noteOrAudioTouches(world)).toStrictEqual([]);
  });

  it("selects a clip named by id in session view, highlighting its slot", () => {
    const songView = registerMockObject("song-view", {
      path: livePath.view.song,
    });

    const result = select({ id: "with-env" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        view: "session",
        selectedClip: { id: "with-env", path: "rt1/s0" },
      }),
    );
    expect(songView.set).toHaveBeenCalledWith(
      "highlighted_clip_slot",
      "id r1s0",
    );
    expect(songView.set).toHaveBeenCalledWith("detail_clip", "id with-env");
  });

  it("selects an empty return track slot without a clip", () => {
    const result = select({ path: "rt0/s2" });

    expect(result.selectedClip).toBeUndefined();
    expect(result.view).toBe("session");
  });

  it("refuses a slot whose return track isn't there", () => {
    expect(() => select({ path: "rt9/s0" })).toThrow('no track at "rt9"');
  });

  it("refuses an envelope clip and a scene id that name different scenes", () => {
    expect(() => select({ clipId: "no-envs", sceneId: "scene2" })).toThrow(
      "sceneId and clipId name different scenes",
    );
    expect(() =>
      select({ clipId: "no-envs", sceneId: "scene0" }),
    ).not.toThrow();
  });

  it("refuses an envelope clip and a track id that name different tracks", () => {
    expect(() => select({ clipId: "no-envs", trackId: "return1" })).toThrow(
      "trackId and clipId name different tracks",
    );
    expect(() =>
      select({ clipId: "no-envs", trackId: "return0" }),
    ).not.toThrow();
  });

  it("refuses an id that names a different clip than the path", () => {
    expect(() => select({ path: "rt0/s0", id: "with-env" })).toThrow(
      "path and id name different targets",
    );
  });

  it("refuses a return-track slot on Live 12, saying so", () => {
    resetWritableEnvelopeWorld("12.4.15");

    expect(() => select({ path: "rt0/s0" })).toThrow(
      'invalid path "rt0/s0" - return-track clips need Live 13',
    );
  });
});

describe("create-clip - envelope clips", () => {
  it("never makes one, on Live 13 or Live 12", async () => {
    clearMockRegistry();

    const world = registerWritableEnvelopeWorld();

    await expect(createClip({ path: "rt0/s1" })).rejects.toThrow(
      "envelope clips can't be created; make one in Live",
    );
    expect(world.slots[0]?.[1]?.call).not.toHaveBeenCalled();

    resetWritableEnvelopeWorld("12.4.15");

    await expect(createClip({ path: "rt0/s1" })).rejects.toThrow(NEEDS_13);
  });
});
