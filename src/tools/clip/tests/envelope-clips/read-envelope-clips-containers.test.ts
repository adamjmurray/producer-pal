// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What a track, a scene and the Live Set say about Live 13 return-track clips.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { readScene } from "#src/tools/scene/read-scene.ts";
import { readTrack } from "#src/tools/track/read/read-track.ts";
import {
  clipSlotReadsOnReturns,
  registerEnvelopeWorld,
} from "./envelope-clip-test-helpers.ts";

describe("read-track - Live 13 return-track clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("lists a return track's session clips, each keeping its envelope type", () => {
    registerEnvelopeWorld();

    const result = readTrack({
      path: "rt1",
      include: ["session-clips"],
    }) as Record<string, unknown>;

    expect(result.sessionClips).toStrictEqual([
      expect.objectContaining({
        id: "with-env",
        type: "envelope",
        name: "With Env",
        path: "rt1/s0",
        envs: true,
      }),
    ]);
  });

  it("counts them where a regular track shows its count", () => {
    registerEnvelopeWorld();

    const result = readTrack({ path: "rt0" }) as Record<string, unknown>;

    expect(result.sessionClipCount).toBe(1);
  });

  it("lists no clips for a return track on Live 12, and never asks it for slots", () => {
    const world = registerEnvelopeWorld("12.4.15");
    const listed = readTrack({
      path: "rt0",
      include: ["session-clips"],
    }) as Record<string, unknown>;
    const counted = readTrack({ path: "rt0" }) as Record<string, unknown>;

    expect(listed.sessionClips).toStrictEqual([]);
    expect(counted).not.toHaveProperty("sessionClipCount");
    expect(clipSlotReadsOnReturns(world)).toStrictEqual([]);
  });
});

describe("read-scene - Live 13 return-track clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("lists a scene's return-track clips after the regular tracks', with their track names", () => {
    registerEnvelopeWorld();

    const result = readScene({ path: "s0", include: ["clips"] }) as {
      clips: Array<Record<string, unknown>>;
    };

    expect(result.clips).toStrictEqual([
      expect.objectContaining({
        id: "no-envs",
        type: "envelope",
        path: "rt0/s0",
        trackName: "A-Echo",
      }),
      expect.objectContaining({
        id: "with-env",
        path: "rt1/s0",
        trackName: "B-Wide Hallway",
      }),
    ]);
  });

  it("lists nothing for a scene whose return slots are empty", () => {
    registerEnvelopeWorld();

    const result = readScene({ path: "s1", include: ["clips"] }) as {
      clips: unknown[];
    };

    expect(result.clips).toStrictEqual([]);
  });

  it("counts them in the scene's clip count", () => {
    registerEnvelopeWorld();

    expect(readScene({ path: "s0" })).toStrictEqual(
      expect.objectContaining({ clipCount: 2 }),
    );
    expect(readScene({ path: "s1" })).toStrictEqual(
      expect.objectContaining({ clipCount: 0 }),
    );
  });

  it("counts none on Live 12, and never asks a return track for slots", () => {
    const world = registerEnvelopeWorld("12.4.15");

    expect(readScene({ path: "s0" })).toStrictEqual(
      expect.objectContaining({ clipCount: 0 }),
    );
    expect(clipSlotReadsOnReturns(world)).toStrictEqual([]);
  });
});

describe("read-live-set - Live 13 return-track clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("counts return-track clips per scene and gives each return track its own count", () => {
    registerEnvelopeWorld();

    const result = readLiveSet({
      include: ["scenes", "tracks"],
    }) as {
      scenes: Array<{ clipCount: number }>;
      returnTracks: Array<{ sessionClipCount?: number }>;
    };

    expect(result.scenes.map((scene) => scene.clipCount)).toStrictEqual([
      2, 0, 0,
    ]);
    expect(
      result.returnTracks.map((track) => track.sessionClipCount),
    ).toStrictEqual([1, 1]);
  });

  it("changes nothing on Live 12: no return clip counts, no slot reads", () => {
    const world = registerEnvelopeWorld("12.4.15");
    const result = readLiveSet({
      include: ["scenes", "tracks"],
    }) as {
      scenes: Array<{ clipCount: number }>;
      returnTracks: Array<Record<string, unknown>>;
    };

    expect(result.scenes.map((scene) => scene.clipCount)).toStrictEqual([
      0, 0, 0,
    ]);

    for (const track of result.returnTracks) {
      expect(track).not.toHaveProperty("sessionClipCount");
    }

    expect(clipSlotReadsOnReturns(world)).toStrictEqual([]);
  });
});
