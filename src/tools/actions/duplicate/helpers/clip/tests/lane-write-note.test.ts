// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Copying a session clip with automation to the arrangement makes Live write
// that automation to the track's lane over the copy's span. The copy's entry
// says so, once, whichever way the copy was made.

import { describe, expect, it } from "vitest";
import "../../../tests/duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  copyAtLength,
  LANE_WRITE_NOTE,
} from "./stamp-automation-test-helpers.ts";
import { registerStampWorld } from "./stamp-world-test-helpers.ts";

describe("the lane-write note, at the clip's own length", () => {
  it.each([
    ["MIDI", {}],
    ["warped audio", { is_midi_clip: 0, warping: 1 }],
  ])("is on a copy of %s with automation", async (_name, source) => {
    const world = registerStampWorld({ source });
    const clips = await copyAtLength(world, 4);

    expect(clips).toHaveLength(1);
    expect(clips[0]?.detail).toBe(LANE_WRITE_NOTE);
  });

  it.each([
    ["a clip with no automation", { has_envelopes: 0 }],
    ["unwarped audio", { is_midi_clip: 0, warping: 0 }],
    ["an arrangement clip", { is_arrangement_clip: 1 }],
  ])("is not on a copy of %s", async (_name, source) => {
    const world = registerStampWorld({ source });
    const clips = await copyAtLength(world, 3);

    expect(clips[0]?.detail).toBeUndefined();
  });
});

describe("the lane-write note, at another length", () => {
  it.each([
    ["shorter", 3],
    ["longer", 10],
  ])(
    "is said once on a %s copy that stamped the lane",
    async (_name, beats) => {
      const world = registerStampWorld();
      const clips = await copyAtLength(world, beats);

      expect(clips[0]?.detail).toBe(LANE_WRITE_NOTE);
      expect(clips.slice(1).map((clip) => clip.detail)).not.toContain(
        LANE_WRITE_NOTE,
      );
    },
  );

  it("is on a warped audio copy too", async () => {
    const world = registerStampWorld({
      source: { is_midi_clip: 0, warping: 1 },
    });
    const clips = await copyAtLength(world, 6);

    expect(clips[0]?.detail).toBe(LANE_WRITE_NOTE);
  });

  it("gives way to the partial note when stamping stops early", async () => {
    const world = registerStampWorld();

    world.declinesCopy = (count) => count === 1;

    const clips = await copyAtLength(world, 10);

    expect(clips[0]?.detail).not.toContain(LANE_WRITE_NOTE);
    expect(clips[0]?.detail).toContain("automation written for the first 4");
  });
});

describe("duplicate - the lane-write note on the copy's entry", () => {
  it("is on a clip copy with no arrangementLength", async () => {
    const world = registerStampWorld();
    const result = await duplicate({
      type: "clip",
      id: world.source.id,
      arrangementStart: "5|1",
    });

    expect(result).toStrictEqual({
      id: expect.any(String) as string,
      path: "t0[5|1]",
      detail: LANE_WRITE_NOTE,
    });
  });

  it("is not on a clip copy without automation", async () => {
    const world = registerStampWorld({ source: { has_envelopes: 0 } });
    const result = await duplicate({
      type: "clip",
      id: world.source.id,
      arrangementStart: "5|1",
    });

    expect(JSON.stringify(result)).not.toContain(LANE_WRITE_NOTE);
  });

  it("is on a clip copy at another length, once", async () => {
    const world = registerStampWorld();
    const result = await duplicate({
      type: "clip",
      id: world.source.id,
      arrangementStart: "5|1",
      arrangementLength: "2bar",
    });

    expect(result).toStrictEqual({
      id: expect.any(String) as string,
      path: "t0[5|1]",
      detail: LANE_WRITE_NOTE,
    });
  });

  it.each([
    ["its own length", undefined],
    ["another length", "2bar"],
  ])(
    "is said once for a scene copy at %s",
    async (_name, arrangementLength) => {
      registerStampWorld();

      const result = await duplicate({
        type: "scene",
        id: "world_scene_0",
        arrangementStart: "5|1",
        arrangementLength,
      });

      expect(JSON.stringify(result).split(LANE_WRITE_NOTE)).toHaveLength(2);
    },
  );

  it("is not on a scene copy whose clip has no automation", async () => {
    registerStampWorld({ source: { has_envelopes: 0 } });

    const result = await duplicate({
      type: "scene",
      id: "world_scene_0",
      arrangementStart: "5|1",
    });

    expect(JSON.stringify(result)).not.toContain(LANE_WRITE_NOTE);
  });
});
