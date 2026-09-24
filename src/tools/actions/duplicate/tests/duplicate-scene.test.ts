// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "./duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  createStandardMidiClipMock,
  registerClipMocks,
  children,
  registerClipSlot,
  registerMockObject,
  setupArrangementSceneMocks,
  setupSessionSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  registerArrangementClip,
  registerTrackThatClearsOnDup,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import { deleteMockObject } from "#src/test/mocks/mock-registry.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

interface DuplicateClipResult {
  id: string;
  path?: string;
}

interface DuplicateSceneResult {
  id?: string;
  path?: string;
  arrangementStart?: string;
  clips: DuplicateClipResult[];
}

const SCENE_CLIP_ID = "id live_set/tracks/0/clip_slots/0/clip";

/**
 * Assert the scene's source clip was duplicated to the arrangement at a beat.
 * @param track - Track mock holding the duplicate_clip_to_arrangement method
 * @param beat - Expected arrangement start beat
 */
function expectSceneDupAtBeat(
  track: ReturnType<typeof registerTrackWithArrangementDup>,
  beat: number,
): void {
  expect(track.call).toHaveBeenCalledWith(
    "duplicate_clip_to_arrangement",
    SCENE_CLIP_ID,
    beat,
  );
}

/**
 * One session scene whose clip sits in track 0's first slot, plus the two
 * arrangement clips a copy to beats 16 and 32 lands as.
 * @returns The track the copies are made on
 */
function setupSceneCopiedToBeats16And32(): ReturnType<
  typeof registerTrackWithArrangementDup
> {
  setupArrangementSceneMocks(1);
  registerClipSlot(0, 0, true, createStandardMidiClipMock());

  const track0 = registerTrackWithArrangementDup(0);

  registerArrangementClip(0, 0, 16);
  registerArrangementClip(0, 1, 32);

  return track0;
}

/**
 * Two session scenes, each holding an 8-beat clip on the one track, and a
 * track whose arrangement copies clear whatever they land on.
 * @returns The track the copies are made on
 */
function setupTwoScenesOnOneTrack(): ReturnType<
  typeof registerTrackThatClearsOnDup
> {
  setupArrangementSceneMocks(1);
  registerMockObject("scene2", { path: livePath.scene(1) });
  registerClipSlot(0, 0, true, createStandardMidiClipMock());
  registerClipSlot(0, 1, true, createStandardMidiClipMock());

  return registerTrackThatClearsOnDup(0, undefined, 8);
}

describe("duplicate - scene duplication", () => {
  // has_clip can still be set on a slot Live hands back nothing for, so the
  // scan checks the clip itself before reporting it.
  it("leaves out a slot that says it has a clip but hands back none", async () => {
    setupSessionSceneMocks();
    deleteMockObject(livePath.track(1).clipSlot(1).clip());

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
    })) as DuplicateSceneResult;

    expect(result.clips).toStrictEqual([
      { id: "live_set/tracks/0/clip_slots/1/clip", path: "t0/s1" },
    ]);
  });

  it("should duplicate a single scene to session view (default behavior)", async () => {
    const liveSet = setupSessionSceneMocks();

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
    })) as DuplicateSceneResult;

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      path: "s1",
      clips: [
        {
          id: "live_set/tracks/0/clip_slots/1/clip",
          path: "t0/s1",
        },
        {
          id: "live_set/tracks/1/clip_slots/1/clip",
          path: "t1/s1",
        },
      ],
    });

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
  });

  it("should duplicate multiple scenes with same name", async () => {
    const liveSet = setupSessionSceneMocks({ registerNewScene: false });

    // Register additional clip slots and mocks for second duplicated scene
    registerClipSlot(0, 2, true);
    registerClipSlot(1, 2, true);
    registerClipMocks(2, 2);

    const scene1 = registerMockObject("live_set/scenes/1", {
      path: livePath.scene(1),
    });
    const scene2 = registerMockObject("live_set/scenes/2", {
      path: livePath.scene(2),
    });

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      count: 2,
      name: "Custom Scene",
    })) as DuplicateSceneResult[];

    expect(result).toStrictEqual([
      {
        id: "live_set/scenes/1",
        path: "s1",
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/1/clip",
            path: "t0/s1",
          },
          {
            id: "live_set/tracks/1/clip_slots/1/clip",
            path: "t1/s1",
          },
        ],
      },
      {
        id: "live_set/scenes/2",
        path: "s2",
        clips: [
          {
            id: "live_set/tracks/0/clip_slots/2/clip",
            path: "t0/s2",
          },
          {
            id: "live_set/tracks/1/clip_slots/2/clip",
            path: "t1/s2",
          },
        ],
      },
    ]);

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 1);

    expect(scene1.set).toHaveBeenCalledWith("name", "Custom Scene");
    expect(scene2.set).toHaveBeenCalledWith("name", "Custom Scene");
  });

  it("should duplicate a scene without clips when withoutClips is true", async () => {
    const liveSet = setupArrangementSceneMocks();

    const slot0 = registerClipSlot(0, 1, true);
    const slot1 = registerClipSlot(1, 1, true);

    registerClipSlot(2, 1, false);
    registerClipMocks(2, 1);
    registerMockObject("live_set/scenes/1", { path: livePath.scene(1) });

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      withoutClips: true,
    })) as DuplicateSceneResult;

    expect(result).toStrictEqual({
      id: "live_set/scenes/1",
      path: "s1",
      clips: [],
    });

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);

    // Verify delete_clip was called for clips in the duplicated scene
    expect(slot0.call).toHaveBeenCalledWith("delete_clip");
    expect(slot1.call).toHaveBeenCalledWith("delete_clip");

    const slot0DeleteCalls = slot0.call.mock.calls.filter(
      (c: unknown[]) => c[0] === "delete_clip",
    ).length;
    const slot1DeleteCalls = slot1.call.mock.calls.filter(
      (c: unknown[]) => c[0] === "delete_clip",
    ).length;

    expect(slot0DeleteCalls + slot1DeleteCalls).toBe(2);
  });

  describe("arrangement destination", () => {
    it("should duplicate a scene to arrangement view", async () => {
      setupArrangementSceneMocks();

      registerClipSlot(
        0,
        0,
        true,
        createStandardMidiClipMock({
          length: 4,
          name: "Clip 1",
        }),
      );
      registerClipSlot(1, 0, false);
      registerClipSlot(2, 0, true, {
        length: 8,
        name: "Clip 2",
        color: 8355711,
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 0,
        loop_start: 0,
        loop_end: 8,
        is_midi_clip: 1,
      });

      // Register tracks with duplicate_clip_to_arrangement method
      const track0 = registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
        methods: {
          duplicate_clip_to_arrangement: (clipId: unknown) => {
            const trackMatch = (clipId as string).match(/tracks\/(\d+)/);
            const trackIdx = trackMatch ? Number(trackMatch[1]) : 0;

            return ["id", livePath.track(trackIdx).arrangementClip(0)];
          },
        },
      });

      registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
      });
      const track2 = registerMockObject("live_set/tracks/2", {
        path: livePath.track(2),
        methods: {
          duplicate_clip_to_arrangement: (clipId: unknown) => {
            const trackMatch = (clipId as string).match(/tracks\/(\d+)/);
            const trackIdx = trackMatch ? Number(trackMatch[1]) : 2;

            return ["id", livePath.track(trackIdx).arrangementClip(0)];
          },
        },
      });

      // Register arrangement clips
      registerArrangementClip(0, 0, 16);
      registerArrangementClip(2, 0, 16);

      const result = (await duplicate({
        type: "scene",
        id: "scene1",

        arrangementStart: "5|1",
      })) as DuplicateSceneResult;

      // Both clips now use duplicate_clip_to_arrangement
      // Track 0 clip (4 beats -> 8 beats) - lengthened via updateClip
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );
      // Track 2 clip (8 beats -> 8 beats) - exact match, no updateClip needed
      expect(track2.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/2/clip_slots/0/clip",
        16,
      );

      // Verify result structure. Each clip's own path says where it landed,
      // so the batch reports no position of its own.
      expect(result).toHaveProperty("clips");
      expect(Array.isArray(result.clips)).toBe(true);
      // At least the exact-match clip (track 2) should appear
      // Track 0's lengthening via updateClip is tested in updateClip's own tests
      expect(
        result.clips.some((c: DuplicateClipResult) => c.path === "t2[5|1]"),
      ).toBe(true);
    });

    // A scene copy lands a clip on every track, so it has no lane to name —
    // the bare coordinate is its whole destination, and it is what the
    // arrangementStart deprecation points at.
    it("takes a bare coordinate on toPath", async () => {
      setupArrangementSceneMocks(1);

      registerClipSlot(0, 0, true, createStandardMidiClipMock());

      const track0 = registerTrackWithArrangementDup(0);

      registerArrangementClip(0, 0, 16);

      await duplicate({ type: "scene", id: "scene1", toPath: "[5|1]" });

      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );
    });

    it("refuses a lane on a scene's toPath", async () => {
      setupArrangementSceneMocks();

      await expect(
        duplicate({ type: "scene", id: "scene1", toPath: "t0[5|1]" }),
      ).rejects.toThrow(
        'toPath "t0[5|1]" names a lane, but a scene copies ' +
          'across every track; name the position alone, as "[5|1]"',
      );
    });

    it("puts color on a scene's arrangement copies", async () => {
      setupArrangementSceneMocks(1);

      registerClipSlot(0, 0, true, createStandardMidiClipMock());

      const track0 = registerTrackWithArrangementDup(0);

      const clip = registerArrangementClip(0, 0, 16);

      await duplicate({
        type: "scene",
        id: "scene1",
        toPath: "[5|1]",
        color: "#00ff00",
      });

      expectSceneDupAtBeat(track0, 16);
      // Color, like name, lands on the clip the copy places.
      expect(clip.set).toHaveBeenCalledWith("color", 0x00ff00);
    });

    it("refuses a scene toPath that names no arrangement position", async () => {
      setupArrangementSceneMocks();

      // A scene's only destination is an arrangement position — a session
      // path names something a scene copy can't land on, so the call is
      // refused up front rather than silently duplicating into the session.
      await expect(
        duplicate({ type: "scene", id: "scene1", toPath: "t0/s5" }),
      ).rejects.toThrow(
        'toPath "t0/s5" names no arrangement position; a scene\'s ' +
          'only destination is one, written as "[5|1]"',
      );
    });

    it("refuses a scene position spelled on both params", async () => {
      setupArrangementSceneMocks();

      await expect(
        duplicate({
          type: "scene",
          id: "scene1",
          toPath: "[5|1]",
          arrangementStart: "9|1",
        }),
      ).rejects.toThrow("both name a song position; use one");
    });

    it("rejects a 0-indexed arrangementStart with the 1-indexing steer", async () => {
      setupArrangementSceneMocks();

      // Parity with create-clip: a 0-indexed/zero-bar arrangement start is a
      // hard error, not a silent pre-origin beat.
      await expect(
        duplicate({ type: "scene", id: "scene1", arrangementStart: "0|1" }),
      ).rejects.toThrow(/1-indexed/);
    });

    it("rejects a malformed arrangementStart that parses to no positions", async () => {
      setupArrangementSceneMocks();

      // "," survives the earlier trim-only checks but names no position; it
      // must throw, not silently produce no duplicates.
      await expect(
        duplicate({ type: "scene", id: "scene1", arrangementStart: "," }),
      ).rejects.toThrow('invalid arrangementStart "," - it names nothing');
    });

    it("should duplicate multiple scenes to arrangement view at sequential positions", async () => {
      setupArrangementSceneMocks(1);

      // Mock scene with one clip of length 8 beats
      registerClipSlot(0, 0, true, createStandardMidiClipMock());

      const track0 = registerTrackWithArrangementDup(0);

      // Register arrangement clips with sequential start times
      const clips = [
        registerArrangementClip(0, 0, 16),
        registerArrangementClip(0, 1, 24),
        registerArrangementClip(0, 2, 32),
      ];

      const result = (await duplicate({
        type: "scene",
        id: "scene1",

        arrangementStart: "5|1",
        count: 3,
        name: "Scene Copy",
      })) as DuplicateSceneResult[];

      // Scenes should be placed at sequential positions based on scene length (8 beats)
      // All use duplicate_clip_to_arrangement (exact match, no lengthening needed)
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        16,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        24,
      );
      expect(track0.call).toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        32,
      );

      // The name lands on the clips; the result reports id and path only, so
      // it never echoes an arg that took effect as intended.
      for (const clip of clips) {
        expect(clip.set).toHaveBeenCalledWith("name", "Scene Copy");
      }

      // Beats 16, 24 and 32, which the song's 4/4 spells as bars 5, 7 and 9.
      expect(result).toStrictEqual([
        {
          clips: [
            {
              id: livePath.track(0).arrangementClip(0),
              path: "t0[5|1]",
            },
          ],
        },
        {
          clips: [
            {
              id: livePath.track(0).arrangementClip(1),
              path: "t0[7|1]",
            },
          ],
        },
        {
          clips: [
            {
              id: livePath.track(0).arrangementClip(2),
              path: "t0[9|1]",
            },
          ],
        },
      ]);
    });

    it("places a single scene at comma-separated arrangementStart positions", async () => {
      const track0 = setupSceneCopiedToBeats16And32();

      // Regression: a comma-separated arrangementStart threw for scenes while it
      // worked for clips. Both explicit positions are now honored: 5|1 -> beat
      // 16, 9|1 -> beat 32 (count defaults to 1, so no sequential expansion).
      const result = (await duplicate({
        type: "scene",
        id: "scene1",
        arrangementStart: "5|1, 9|1",
        name: "Scene Copy",
      })) as DuplicateSceneResult[];

      expectSceneDupAtBeat(track0, 16);
      expectSceneDupAtBeat(track0, 32);
      // Each copy's clip says where it landed: beats 16 and 32 in 4/4.
      expect(result.map((r) => r.clips[0]?.path)).toStrictEqual([
        "t0[5|1]",
        "t0[9|1]",
      ]);
    });

    it("warns and ignores count when several arrangementStart positions are named", async () => {
      const track0 = setupSceneCopiedToBeats16And32();

      // Two positions named, count says 2 as well — one copy per position,
      // same as the clip path's "count ignored for clips" warning.
      const result = (await duplicate({
        type: "scene",
        id: "scene1",
        arrangementStart: "5|1, 9|1",
        count: 2,
      })) as DuplicateSceneResult[];

      expect(result).toHaveLength(2);
      expectSceneDupAtBeat(track0, 16);
      expectSceneDupAtBeat(track0, 32);
      expect(capturedWarnings()).toContain(
        "count ignored for scenes: one copy per position — list more in toPath",
      );
    });

    it("should handle empty scenes gracefully", async () => {
      setupArrangementSceneMocks(2);

      registerClipSlot(0, 0, false);
      registerClipSlot(1, 0, false);

      const result = (await duplicate({
        type: "scene",
        id: "scene1",

        arrangementStart: "5|1",
      })) as DuplicateSceneResult;

      expect(result).toStrictEqual({ clips: [] });
    });

    it("should duplicate a scene to arrangement without clips when withoutClips is true", async () => {
      setupArrangementSceneMocks();

      registerClipSlot(0, 0, true, { length: 4 });
      registerClipSlot(1, 0, false);
      registerClipSlot(2, 0, true, { length: 8 });

      const track0 = registerMockObject("live_set/tracks/0", {
        path: livePath.track(0),
      });

      const track1 = registerMockObject("live_set/tracks/1", {
        path: livePath.track(1),
      });
      const track2 = registerMockObject("live_set/tracks/2", {
        path: livePath.track(2),
      });

      const result = (await duplicate({
        type: "scene",
        id: "scene1",

        arrangementStart: "5|1",
        withoutClips: true,
      })) as DuplicateSceneResult;

      // Verify that duplicate_clip_to_arrangement was NOT called on any track
      expect(track0.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.any(String),
        expect.any(Number),
      );
      expect(track1.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.any(String),
        expect.any(Number),
      );
      expect(track2.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.any(String),
        expect.any(Number),
      );

      expect(result).toStrictEqual({ clips: [] });
    });
  });

  it("should apply color when duplicating a scene", async () => {
    registerMockObject("scene1", { path: livePath.scene(0) });

    const liveSet = registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: [] },
    });

    const newScene = registerMockObject("live_set/scenes/1", {
      path: livePath.scene(1),
    });

    const result = (await duplicate({
      type: "scene",
      id: "scene1",
      color: "#00ff00",
    })) as DuplicateSceneResult;

    expect(liveSet.call).toHaveBeenCalledWith("duplicate_scene", 0);
    expect(newScene.set).toHaveBeenCalledWith("color", 0x00ff00);
    expect(result.id).toBe("live_set/scenes/1");
    expect(result.path).toBe("s1");
  });

  it("names the positions a cut-short arrangement duplicate did not reach", async () => {
    // A scene copy places a clip per track, so a few can eat the whole budget.
    setupArrangementSceneMocks(1);

    const track0 = registerTrackWithArrangementDup(0);

    const result = await duplicate(
      { type: "scene", id: "scene1", arrangementStart: "5|1,9|1" },
      { deadline: Date.now() - 1 },
    );

    expect(result).toStrictEqual([]);
    expect(track0.call).not.toHaveBeenCalled();
    expect(capturedWarnings()).toContain(
      "Ran out of time after duplicating 0 of 2. " +
        "Not duplicated: 5|1, 9|1. Re-run for those positions.",
    );
  });

  it("stops session scene copies at the request deadline", async () => {
    const liveSet = setupSessionSceneMocks();

    const result = await duplicate(
      { type: "scene", id: "scene1", count: 2 },
      { deadline: Date.now() - 1 },
    );

    expect(result).toStrictEqual([]);
    expect(liveSet.call).not.toHaveBeenCalledWith("duplicate_scene", 0);
    expect(capturedWarnings()).toContain(
      "Ran out of time after duplicating 0 of 2 scenes. Re-run for the rest.",
    );
  });
});

describe("duplicate - several scenes to the arrangement", () => {
  // A position list pairs with the scenes, like a clip's does, so each scene
  // takes its own spot instead of every scene landing on every spot.
  it("pairs a position list one per scene", async () => {
    const track0 = setupTwoScenesOnOneTrack();

    const result = await duplicate({
      type: "scene",
      id: "scene1,scene2",
      toPath: "[1|1],[9|1]",
    });

    expect(track0.call.mock.calls).toStrictEqual([
      [
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/0/clip",
        0,
      ],
      [
        "duplicate_clip_to_arrangement",
        "id live_set/tracks/0/clip_slots/1/clip",
        32,
      ],
    ]);
    expect(result).toStrictEqual([
      {
        clips: [{ id: livePath.track(0).arrangementClip(0), path: "t0[1|1]" }],
      },
      {
        clips: [{ id: livePath.track(0).arrangementClip(1), path: "t0[9|1]" }],
      },
    ]);
  });

  it("refuses a position list that doesn't name one per scene", async () => {
    setupTwoScenesOnOneTrack();

    await expect(
      duplicate({
        type: "scene",
        id: "scene1,scene2",
        toPath: "[1|1],[9|1],[17|1]",
      }),
    ).rejects.toThrow("toPath names 3 destinations but id names 2 sources");
  });

  // Scenes share every track, so one position for two would bury the first
  // copy under the second. Refused before anything is copied.
  it.each([
    ["toPath", { toPath: "[5|1]" }],
    ["arrangementStart", { arrangementStart: "5|1" }],
  ])("refuses one %s position for several scenes", async (param, dest) => {
    const track0 = setupTwoScenesOnOneTrack();

    await expect(
      duplicate({ type: "scene", id: "scene1,scene2", ...dest }),
    ).rejects.toThrow(
      `${param} names 1 destination but id names 2 sources. A destination ` +
        `holds one object, so ${param} must name one per source, in order.`,
    );
    expect(track0.call).not.toHaveBeenCalled();
  });

  // Scenes sharing a track can still land on each other when the caller names
  // one spot twice. The buried copy says so instead of reporting a dead id.
  it("marks a scene copy a later one in the call landed on", async () => {
    setupTwoScenesOnOneTrack();

    const result = await duplicate({
      type: "scene",
      id: "scene1,scene2",
      toPath: "[5|1],[5|1]",
    });

    expect(result).toStrictEqual([
      { clips: [{ path: "t0[5|1]", overwritten: true }] },
      {
        clips: [{ id: livePath.track(0).arrangementClip(1), path: "t0[5|1]" }],
      },
    ]);
  });

  // The other spelling pairs the same way, and its mismatch names the param
  // the caller wrote.
  it("pairs an arrangementStart list one per scene", async () => {
    const track0 = setupTwoScenesOnOneTrack();

    await duplicate({
      type: "scene",
      id: "scene1,scene2",
      arrangementStart: "1|1,9|1",
    });

    expect(track0.call).toHaveBeenCalledTimes(2);
    expectSceneDupAtBeat(track0, 0);
    expect(track0.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      "id live_set/tracks/0/clip_slots/1/clip",
      32,
    );
  });

  it("refuses an arrangementStart list that doesn't name one per scene", async () => {
    setupTwoScenesOnOneTrack();

    await expect(
      duplicate({
        type: "scene",
        id: "scene1,scene2",
        arrangementStart: "1|1,9|1,17|1",
      }),
    ).rejects.toThrow(
      "arrangementStart names 3 destinations but id names 2 sources",
    );
  });

  // A position list names one copy per position, however it pairs out, so
  // count is ignored as it is for one scene — each scene laying count copies
  // from its own position would bury the next scene's.
  it("ignores count when the call names a position list", async () => {
    const track0 = setupTwoScenesOnOneTrack();

    const result = await duplicate({
      type: "scene",
      id: "scene1,scene2",
      toPath: "[1|1],[9|1]",
      count: 2,
    });

    expect(result).toHaveLength(2);
    expect(track0.call).toHaveBeenCalledTimes(2);
    expect(capturedWarnings()).toContain(
      "count ignored for scenes: one copy per position — list more in toPath",
    );
  });

  // An inserted session scene shifts the copies below it, which is not the
  // same as burying them: every copy here is still there.
  it("marks no session scene copy overwritten when a later one shifts it", async () => {
    registerMockObject("sceneA", { path: livePath.scene(0) });
    registerMockObject("sceneB", { path: livePath.scene(1) });
    registerMockObject("live_set", {
      path: livePath.liveSet,
      properties: { tracks: children("track0") },
      methods: {
        // Copying scene 0 inserts at 1, pushing sceneB's copy from 2 to 3.
        duplicate_scene: (index: unknown) => {
          if (index === 0) {
            registerMockObject("copyOfB", {
              path: livePath.track(0).clipSlot(3).clip(),
            });
          }
        },
      },
    });
    registerClipSlot(0, 1, true);
    registerClipSlot(0, 2, true);
    registerMockObject("copyOfA", {
      path: livePath.track(0).clipSlot(1).clip(),
    });
    registerMockObject("copyOfB", {
      path: livePath.track(0).clipSlot(2).clip(),
    });

    const result = (await duplicate({
      type: "scene",
      id: "sceneB,sceneA",
    })) as DuplicateSceneResult[];

    expect(
      result.map((entry) => entry.clips.map((clip) => clip.id)),
    ).toStrictEqual([["copyOfB"], ["copyOfA"]]);
  });
});
