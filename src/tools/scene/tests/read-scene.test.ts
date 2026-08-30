// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type ZodType } from "zod";
import { children, expectedClip } from "#src/test/mocks/mock-live-api.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { toolDefReadScene } from "../read-scene.def.ts";
import { readScene } from "../read-scene.ts";

// Helper to create default Scene mock config
const defaultSceneConfig = (overrides: Record<string, unknown> = {}) => ({
  name: "",
  color: 0,
  is_empty: 0,
  is_triggered: 0,
  tempo: 120,
  tempo_enabled: 1,
  time_signature_numerator: 4,
  time_signature_denominator: 4,
  time_signature_enabled: 1,
  ...overrides,
});

function setupLiveSetTracks(trackIds: string[]): void {
  registerMockObject("live_set", {
    path: livePath.liveSet,
    type: "Song",
    properties: {
      tracks: trackIds.length > 0 ? children(...trackIds) : [],
    },
  });

  for (const [index, trackId] of trackIds.entries()) {
    registerMockObject(trackId, {
      path: livePath.track(index),
      type: "Track",
      properties: {
        has_midi_input: 1,
        // Distinct per track, so a clip's trackName has to come from its own
        // track rather than any track that happened to be read
        name: `Track ${index}`,
      },
    });
  }
}

function setupScene(
  sceneId: string,
  sceneIndex: number,
  sceneProperties: Record<string, unknown> = defaultSceneConfig(),
): void {
  registerMockObject(sceneId, {
    path: livePath.scene(sceneIndex),
    type: "Scene",
    properties: sceneProperties,
  });
}

function setupSessionClip(
  clipId: string,
  trackIndex: number,
  sceneIndex: number,
): void {
  registerMockObject(clipId, {
    path: livePath.track(trackIndex).clipSlot(sceneIndex).clip(),
    type: "Clip",
  });
}

describe("readScene", () => {
  it("returns scene information when a valid scene exists", () => {
    setupLiveSetTracks([]);
    setupScene("scene1", 0, defaultSceneConfig({ name: "Test Scene" }));

    const result = readScene({ sceneIndex: 0 });

    expect(result).toStrictEqual({
      id: "scene1",
      name: "Test Scene",
      sceneIndex: 0,
      clipCount: 0,
      tempo: 120,
      timeSignature: "4/4",
    });
  });

  it("throws when no scene exists", () => {
    registerMockObject("0", {
      path: livePath.scene(99),
      type: "Scene",
    });

    expect(() => readScene({ sceneIndex: 99 })).toThrow(
      "readScene: sceneIndex 99 does not exist",
    );
  });

  it("handles disabled tempo and time signature", () => {
    setupLiveSetTracks([]);
    setupScene(
      "scene2",
      1,
      defaultSceneConfig({
        name: "Scene with Disabled Properties",
        color: 65280,
        is_empty: 1,
        is_triggered: 1,
        tempo: -1,
        tempo_enabled: 0,
        time_signature_numerator: -1,
        time_signature_denominator: -1,
        time_signature_enabled: 0,
      }),
    );

    const result = readScene({ sceneIndex: 1 });

    expect(result).toStrictEqual({
      id: "scene2",
      name: "Scene with Disabled Properties",
      sceneIndex: 1,
      clipCount: 0,
      triggered: true,
    });
  });

  it("handles unnamed scenes by showing just the scene number", () => {
    setupLiveSetTracks([]);
    setupScene("scene3", 2, defaultSceneConfig());

    const result = readScene({ sceneIndex: 2 });

    expect(result).toStrictEqual({
      id: "scene3",
      name: "3",
      sceneIndex: 2,
      clipCount: 0,
      tempo: 120,
      timeSignature: "4/4",
    });
  });

  it("returns clipCount when not including clip details", () => {
    setupLiveSetTracks(["track1", "track2", "track3"]);
    setupScene(
      "scene_0",
      0,
      defaultSceneConfig({ name: "Scene with 2 Clips" }),
    );
    setupSessionClip("clip_0_0", 0, 0);
    setupSessionClip("clip_1_0", 1, 0);
    registerMockObject("0", {
      path: livePath.track(2).clipSlot(0).clip(),
      type: "Clip",
    });

    const result = readScene({ sceneIndex: 0 });

    expect(result).toStrictEqual({
      id: "scene_0",
      name: "Scene with 2 Clips",
      sceneIndex: 0,
      clipCount: 2,
      tempo: 120,
      timeSignature: "4/4",
    });
  });

  it("includes the scene color only when color is requested", () => {
    setupLiveSetTracks([]);
    setupScene(
      "scene_c",
      0,
      defaultSceneConfig({ name: "Colored", color: 65280 }),
    );

    const withColor = readScene({ sceneIndex: 0, include: ["color"] });
    const withoutColor = readScene({ sceneIndex: 0 });

    expect(withColor.color).toBe("#00FF00");
    expect(withoutColor).not.toHaveProperty("color");
  });

  it("filters empty clip slots and suppresses their per-clip warnings", () => {
    setupLiveSetTracks(["track1", "track2"]);
    setupScene("scene_f", 0, defaultSceneConfig({ name: "Filtered" }));
    setupSessionClip("clip_0_0", 0, 0);
    // track 1's slot is empty (non-existent clip)
    registerMockObject("0", {
      path: livePath.track(1).clipSlot(0).clip(),
      type: "Clip",
    });

    const result = readScene({ sceneIndex: 0, include: ["clips"] });

    expect(result.clips).toHaveLength(1);
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("no clip at trackIndex"),
    );
  });

  it("includes clip information when includeClips is true", () => {
    setupLiveSetTracks(["track1", "track2"]);
    setupScene("scene_0", 0, defaultSceneConfig({ name: "Scene with Clips" }));
    setupSessionClip("clip_0_0", 0, 0);
    setupSessionClip("clip_1_0", 1, 0);

    const result = readScene({
      sceneIndex: 0,
      include: ["clips", "notes"],
    });

    expect(result).toStrictEqual({
      id: "scene_0",
      name: "Scene with Clips",
      sceneIndex: 0,
      tempo: 120,
      timeSignature: "4/4",
      clips: [
        {
          ...expectedClip({
            id: "clip_0_0",
            path: "t0/s0",
          }),
          color: undefined,
          trackName: "Track 0",
        },
        {
          ...expectedClip({
            id: "clip_1_0",
            path: "t1/s0",
          }),
          color: undefined,
          trackName: "Track 1",
        },
      ].map(({ color: _color, view: _v, ...clip }) => clip),
    });
  });

  it("includes all available options when '*' is used", () => {
    setupLiveSetTracks(["track1", "track2"]);
    setupScene(
      "scene_0",
      0,
      defaultSceneConfig({
        name: "Wildcard Test Scene",
        color: 65280,
        tempo: 140,
        time_signature_numerator: 3,
      }),
    );
    setupSessionClip("clip_0_0", 0, 0);
    setupSessionClip("clip_1_0", 1, 0);

    // Test with '*' - should include everything
    const resultWildcard = readScene({
      sceneIndex: 0,
      include: ["*"],
    });

    // Test explicit list - should produce identical result
    const resultExplicit = readScene({
      sceneIndex: 0,
      include: ["clips", "notes", "sample", "color", "timing", "warp"],
    });

    // Results should be identical
    expect(resultWildcard).toStrictEqual(resultExplicit);

    // Verify key properties are included
    expect(resultWildcard).toStrictEqual(
      expect.objectContaining({
        id: "scene_0",
        name: "Wildcard Test Scene",
        sceneIndex: 0,
        clips: expect.any(Array),
      }),
    );

    // Verify clips array is present
    expect(resultWildcard.clips).toHaveLength(2);
  });

  describe("id parameter", () => {
    it("reads scene by id", () => {
      setupLiveSetTracks([]);
      setupScene(
        "123",
        5,
        defaultSceneConfig({
          name: "Scene by ID",
          color: 255,
          is_triggered: 1,
          tempo: 128,
          time_signature_numerator: 3,
        }),
      );

      const result = readScene({ id: "123" });

      expect(result).toStrictEqual({
        id: "123",
        name: "Scene by ID",
        sceneIndex: 5,
        clipCount: 0,
        triggered: true,
        tempo: 128,
        timeSignature: "3/4",
      });
    });

    // A permanent alias, not a migration: models reach for the prefixed
    // spelling on their own, so it keeps working.
    it("still reads a scene by the sceneId alias", () => {
      setupLiveSetTracks([]);
      setupScene("123", 5, defaultSceneConfig({ name: "Scene by ID" }));

      expect(readScene({ sceneId: "123" })).toStrictEqual({
        clipCount: 0,
        sceneIndex: 5,
        tempo: 120,
        timeSignature: "4/4",
        id: "123",
        name: "Scene by ID",
      });
    });

    it("includes clips when reading scene by id", () => {
      setupLiveSetTracks(["track1", "track2"]);
      setupScene(
        "456",
        2,
        defaultSceneConfig({
          name: "Scene with Clips by ID",
          color: 16776960,
          tempo: 110,
        }),
      );
      setupSessionClip("clip_0_2", 0, 2);
      setupSessionClip("clip_1_2", 1, 2);

      const result = readScene({
        id: "456",
        include: ["clips", "notes"],
      });

      expect(result).toStrictEqual({
        id: "456",
        name: "Scene with Clips by ID",
        sceneIndex: 2,
        tempo: 110,
        timeSignature: "4/4",
        clips: [
          {
            ...expectedClip({
              id: "clip_0_2",
              path: "t0/s2",
            }),
            color: undefined,
            trackName: "Track 0",
          },
          {
            ...expectedClip({
              id: "clip_1_2",
              path: "t1/s2",
            }),
            color: undefined,
            trackName: "Track 1",
          },
        ].map(({ color: _color, view: _v, ...clip }) => clip),
      });
    });

    it("throws error when id does not exist", () => {
      mockNonExistentObjects();

      expect(() => {
        readScene({ id: "nonexistent" });
      }).toThrow('readScene failed: id "nonexistent" does not exist');
    });

    it("throws error when neither id nor sceneIndex provided", () => {
      expect(() => {
        readScene({});
      }).toThrow("Either id or sceneIndex must be provided");
    });

    it("prioritizes id over sceneIndex when both provided", () => {
      setupLiveSetTracks([]);
      setupScene(
        "789",
        7,
        defaultSceneConfig({
          name: "Priority Test Scene",
          color: 8388736, // Purple
          is_empty: 0,
          is_triggered: 0,
          tempo: 100,
          tempo_enabled: 1,
          time_signature_numerator: 4,
          time_signature_denominator: 4,
          time_signature_enabled: 1,
        }),
      );

      // sceneId should take priority over sceneIndex
      const result = readScene({ id: "789", sceneIndex: 3 });

      // Should use scene with ID "789" (index 7) not sceneIndex 3
      expect(result.sceneIndex).toBe(7);
      expect(result.name).toBe("Priority Test Scene");
    });
  });
});

describe("read-scene include schema", () => {
  it("accepts 'warp' in the include enum (parity with read-clip)", () => {
    // warp clip detail must be requestable explicitly through the tool, not
    // only via "*" — the handler already forwards it correctly to readClip.
    // "include" is a declared schema key, so it is always present.
    const includeSchema = toolDefReadScene.toolOptions.inputSchema
      .include as ZodType;

    expect(() => includeSchema.parse(["clips", "warp"])).not.toThrow();
    expect(includeSchema.parse(["warp"])).toStrictEqual(["warp"]);
  });
});
