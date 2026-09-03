// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  createStandardMidiClipMock,
  type RegisteredMockObject,
  registerClipSlot,
  registerMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";

interface CuePointConfig {
  time: number;
  name: string;
}

/**
 * Set up track0 with arrangement clip and locators for duplication tests
 * @param cuePoints - Locator configurations
 * @returns Mock handle for track 0
 */
function setupTrackWithLocators(
  cuePoints: CuePointConfig[],
): RegisteredMockObject {
  const cueIds = cuePoints.map((_, i) => `cue${i}`);

  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      tracks: children("track0"),
      cue_points: children(...cueIds),
    },
  });

  for (let i = 0; i < cuePoints.length; i++) {
    // bounded by cuePoints.length
    const cp = cuePoints[i] as CuePointConfig;

    registerMockObject(`cue${i}`, {
      properties: { time: cp.time, name: cp.name },
    });
  }

  const track0 = registerMockObject("live_set/tracks/0", {
    path: livePath.track(0),
    methods: {
      duplicate_clip_to_arrangement: () => [
        "id",
        livePath.track(0).arrangementClip(0),
      ],
      get_notes_extended: () => JSON.stringify({ notes: [] }),
    },
  });

  registerMockObject("live_set tracks 0 arrangement_clips 0", {
    path: livePath.track(0).arrangementClip(0),
    properties: { is_arrangement_clip: 1, start_time: 8 },
  });

  return track0;
}

/**
 * Set up clip + track mocks with locators for clip duplication tests
 * @param cuePoints - Locator configurations
 * @returns Mock handle for track 0
 */
function setupClipWithLocators(
  cuePoints: CuePointConfig[],
): RegisteredMockObject {
  registerMockObject("clip1", {
    path: livePath.track(0).clipSlot(0).clip(),
  });
  registerMockObject("live_set/tracks/0/clip_slots/0/clip", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: createStandardMidiClipMock({ length: 4, name: "Test Clip" }),
  });

  return setupTrackWithLocators(cuePoints);
}

/**
 * Assert that a clip was duplicated to the arrangement at the given beat positions
 * @param track - Mock track object
 * @param sourceId - Source clip ID string (e.g., "id clip1")
 * @param beats - Expected beat positions
 */
function expectDuplicatedAt(
  track: RegisteredMockObject,
  sourceId: string,
  ...beats: number[]
): void {
  for (const beat of beats) {
    expect(track.call).toHaveBeenCalledWith(
      "duplicate_clip_to_arrangement",
      sourceId,
      beat,
    );
  }
}

/**
 * Set up scene + track mocks with locators for scene duplication tests
 * @param cuePoints - Locator configurations
 * @returns Mock handle for track 0
 */
function setupSceneWithLocators(
  cuePoints: CuePointConfig[],
): RegisteredMockObject {
  registerMockObject("scene1", { path: livePath.scene(0) });
  registerClipSlot(0, 0, true, createStandardMidiClipMock());

  return setupTrackWithLocators(cuePoints);
}

const standardCuePoints: CuePointConfig[] = [
  { time: 0, name: "Start" },
  { time: 8, name: "Drop" },
];

const SCENE_CLIP = "id live_set/tracks/0/clip_slots/0/clip";

describe("duplicate - locators as arrangement positions", () => {
  describe("arrangementStart takes loc:", () => {
    it.each<[string, string, number, string]>([
      ["a locator id", "loc:locator-1", 8, "3|1"],
      ["a locator name", "loc:Drop", 8, "3|1"],
      ["the undocumented prefix", "locator:Drop", 8, "3|1"],
    ])(
      "places a clip copy at %s",
      async (_label, arrangementStart, beats, barBeat) => {
        const track0 = setupClipWithLocators(standardCuePoints);

        const result = await duplicate({
          type: "clip",
          id: "clip1",
          arrangementStart,
        });

        expectDuplicatedAt(track0, "id clip1", beats);
        expect(result).toHaveProperty("arrangementStart", barBeat);
      },
    );

    it.each<[string, string, number, string]>([
      ["a locator id", "loc:locator-1", 16, "5|1"],
      ["a locator name", "loc:Chorus", 32, "9|1"],
    ])(
      "places a scene copy at %s",
      async (_label, arrangementStart, beats, barBeat) => {
        const track0 = setupSceneWithLocators([
          { time: 0, name: "Intro" },
          { time: 16, name: "Verse" },
          { time: 32, name: "Chorus" },
        ]);

        const result = await duplicate({
          type: "scene",
          id: "scene1",
          arrangementStart,
        });

        expectDuplicatedAt(track0, SCENE_CLIP, beats);
        expect(result).toHaveProperty("arrangementStart", barBeat);
      },
    );

    // One list, both spellings: a bar|beat entry passes through untouched.
    it.each<[string, string, number, number]>([
      ["bar|beat and loc:", "1|1,loc:Drop", 0, 8],
      ["two locators", "loc:Start,loc:locator-1", 0, 8],
    ])(
      "places a copy per entry in a list mixing %s",
      async (_l, list, a, b) => {
        const track0 = setupClipWithLocators(standardCuePoints);

        const result = await duplicate({
          type: "clip",
          id: "clip1",
          arrangementStart: list,
        });

        expectDuplicatedAt(track0, "id clip1", a, b);
        expect(result).toHaveLength(2);
      },
    );

    it("refuses an empty entry in the position list", async () => {
      setupClipWithLocators(standardCuePoints);

      await expect(
        duplicate({
          type: "clip",
          id: "clip1",
          arrangementStart: "1|1,,loc:Drop",
        }),
      ).rejects.toThrow(
        'invalid arrangementStart "1|1,,loc:Drop" - it has an empty entry.',
      );
    });
  });

  describe("locator not found", () => {
    /** Register a scene, one locator, and the clip slot a scene copy reads. */
    function setupErrorHandlingMocks(): void {
      registerMockObject("scene1", { path: livePath.scene(0) });
      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: {
          tracks: children("track0"),
          cue_points: children("cue0"),
        },
      });
      registerClipSlot(0, 0, true, {
        length: 8,
        signature_numerator: 4,
        signature_denominator: 4,
      });
      registerMockObject("cue0", { properties: { time: 0, name: "Intro" } });
    }

    // The message names arrangementStart, the param the caller sent — the
    // locator that resolves it is not a param of its own any more.
    it.each<[string, string, string]>([
      ["id", "loc:locator-5", "duplicate failed: locator not found: locator-5"],
      [
        "name",
        "loc:NonExistent",
        'duplicate failed: no locator found with name "NonExistent" for arrangementStart',
      ],
    ])("throws for a locator %s that names nothing", async (_l, start, msg) => {
      setupErrorHandlingMocks();

      await expect(
        duplicate({ type: "scene", id: "scene1", arrangementStart: start }),
      ).rejects.toThrow(msg);
    });

    // A prefix with nothing after it named a position the call can't place, so
    // it is refused before any copy lands rather than duplicating to beat 0.
    it.each([
      ["a bare prefix", "loc:"],
      ["only whitespace after the prefix", "loc:   "],
    ])("throws for %s", async (_label, arrangementStart) => {
      const track0 = setupClipWithLocators(standardCuePoints);

      await expect(
        duplicate({ type: "clip", id: "clip1", arrangementStart }),
      ).rejects.toThrow("names no locator");

      expect(track0.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe("the deprecated locator param", () => {
    it.each<[string, string, number[]]>([
      ["one name", "Drop", [8]],
      ["one id", "locator-1", [8]],
      ["a list, one loc: per entry", "Start, Drop", [0, 8]],
    ])("folds %s onto arrangementStart", async (_label, locator, beats) => {
      const track0 = setupClipWithLocators(standardCuePoints);

      const result = await duplicate({ type: "clip", id: "clip1", locator });

      expectDuplicatedAt(track0, "id clip1", ...beats);
      expect(Array.isArray(result) ? result : [result]).toHaveLength(
        beats.length,
      );
    });

    it("folds onto a scene's position too", async () => {
      const track0 = setupSceneWithLocators([
        { time: 0, name: "Intro" },
        { time: 16, name: "Verse" },
      ]);

      const result = await duplicate({
        type: "scene",
        id: "scene1",
        locator: "locator-1",
      });

      expectDuplicatedAt(track0, SCENE_CLIP, 16);
      expect(result).toHaveProperty("arrangementStart", "5|1");
    });

    // Never pick one: the two params name the same position, so a caller who
    // sent both told us two different things about it.
    it.each([
      ["an id", "locator-0"],
      ["a name", "Verse"],
    ])("refuses arrangementStart plus %s", async (_label, locator) => {
      registerMockObject("scene1", { path: livePath.scene(0) });

      await expect(
        duplicate({
          type: "scene",
          id: "scene1",
          arrangementStart: "5|1",
          locator,
        }),
      ).rejects.toThrow(
        "duplicate failed: arrangementStart and locator are mutually exclusive",
      );
    });

    // A device has no arrangement position, so neither param is read and there
    // is nothing to refuse — the same rule that lets a session playback action
    // carry a conflicting startTime/startLocator pair. They are reported as
    // ignored instead.
    it("does not refuse the pair on a type that reads neither", async () => {
      registerMockObject("live_set", {
        path: livePath.liveSet,
        properties: { tracks: children("track0") },
      });
      registerMockObject("track0", {
        path: livePath.track(0),
        properties: { devices: children("device1") },
      });
      registerMockObject("device1", {
        path: livePath.track(0).device(0),
        type: "PluginDevice",
      });

      // Whatever else the call goes on to do, the pair itself was not refused.
      const outcome = await duplicate({
        type: "device",
        id: "device1",
        arrangementStart: "5|1",
        locator: "Verse",
      }).catch((error: unknown) => error);

      expect(String(outcome)).not.toContain("mutually exclusive");
    });

    // A whitespace-only arrangementStart is an unsent param, so it leaves the
    // locator alone rather than tripping the conflict.
    it("takes the locator when arrangementStart is blank", async () => {
      const track0 = setupClipWithLocators(standardCuePoints);

      await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "   ",
        locator: "Drop",
      });

      expectDuplicatedAt(track0, "id clip1", 8);
    });

    // A locator naming nothing places no copy: the destination list is cycled
    // against the positions, so an empty one would land a copy at beat 0.
    it.each([
      ["empty", ""],
      ["separators only", ","],
      ["whitespace", "   "],
    ])("throws for a locator that is %s", async (_label, locator) => {
      const track0 = setupClipWithLocators(standardCuePoints);

      await expect(
        duplicate({ type: "clip", id: "clip1", locator }),
      ).rejects.toThrow(
        'duplicate failed: arrangementStart "loc:" names no locator',
      );

      expect(track0.call).not.toHaveBeenCalledWith(
        "duplicate_clip_to_arrangement",
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
