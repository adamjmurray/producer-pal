// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Copies that need no stamps are made exactly as before, and the stamped
// ones leave no scratch clip or scene behind.

import { describe, expect, it } from "vitest";
import "../../../tests/duplicate-mocks-test-helpers.ts";
import { createShortenedClipInHoldingMock } from "../../../tests/setup.ts";
import { copyAtLength } from "./stamp-automation-test-helpers.ts";
import { registerStampWorld } from "./stamp-world-test-helpers.ts";

describe("copies that carry their automation on their own", () => {
  it.each([
    [
      "an unwarped audio clip, whose automation never plays",
      { is_midi_clip: 0, warping: 0 },
    ],
    [
      "an arrangement clip, which writes no automation",
      { is_arrangement_clip: 1 },
    ],
    ["a clip with no automation", { has_envelopes: 0 }],
  ])("stamps nothing for %s", async (_name, source) => {
    const world = registerStampWorld({ source });

    await copyAtLength(world, 3);

    // No scratch scene, clip or stamps: whatever is copied is the source itself.
    expect(world.events.filter((event) => event.kind !== "copy")).toStrictEqual(
      [],
    );
    expect(
      world.copies().every((copy) => copy.clipId === world.source.id),
    ).toBe(true);
  });

  it("feeds the holding area the source itself", async () => {
    const world = registerStampWorld({ source: { has_envelopes: 0 } });

    await copyAtLength(world, 3);

    const [held] = createShortenedClipInHoldingMock.mock
      .calls[0] as unknown as [{ id: string }];

    expect(held.id).toBe(world.source.id);
  });

  it("stamps nothing when the length is the clip's own", async () => {
    const world = registerStampWorld();

    await copyAtLength(world, 4);

    // One plain copy of the source, which writes the lane over its own span.
    expect(world.events.map((event) => event.kind)).toStrictEqual(["copy"]);
    expect(world.copies()[0]?.clipId).toBe(world.source.id);
  });
});

describe("the scratch copy", () => {
  it("is removed, with the scene made for it", async () => {
    const world = registerStampWorld();

    await copyAtLength(world, 10);

    const kinds = world.events
      .map((event) => event.kind)
      .filter((kind) => kind !== "set");

    expect(kinds).toStrictEqual([
      "scene-made",
      "copy",
      "delete",
      "copy",
      "delete",
      "copy",
      "delete",
      "clear-envelopes",
      "copy",
      "slot-cleared",
      "scene-removed",
    ]);
    expect(world.sceneCount()).toBe(1);
    expect(world.placedIds()).toHaveLength(1);
  });

  it("goes in the last scene when that is empty, and leaves the scene", async () => {
    const world = registerStampWorld({ lastSceneEmpty: true });

    await copyAtLength(world, 10);

    expect(world.events.map((event) => event.kind)).not.toContain("scene-made");
    expect(world.events.map((event) => event.kind)).toContain("slot-cleared");
    expect(world.sceneCount()).toBe(2);
  });
});
