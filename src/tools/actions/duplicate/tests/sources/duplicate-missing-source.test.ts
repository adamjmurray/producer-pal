// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A source that names nothing, or the wrong kind of thing, keeps the place of
// every copy it was to make, as a skip, and the other sources still copy.

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import {
  registerMockObject,
  setupArrangementSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

const NOWHERE = 'id "nowhere" does not exist';

describe("duplicate - a source that names nothing", () => {
  it("skips each arrangement destination of a clip and copies the other", async () => {
    mockNonExistentObjects();
    registerMockObject("clip1", {
      path: livePath.track(0).arrangementClip(5),
      properties: {
        is_midi_clip: 1,
        is_arrangement_clip: 1,
        start_time: 0,
        end_time: 4,
      },
    });
    registerTrackWithArrangementDup(1, { has_midi_input: 1 });
    registerArrangementClip(1, 0, 32);

    const result = await duplicate({
      type: "clip",
      id: "nowhere,clip1",
      toPath: "t1[5|1],t1[9|1]",
    });

    expect(result).toStrictEqual([
      { path: "t1[5|1]", ok: false, detail: NOWHERE },
      { id: livePath.track(1).arrangementClip(0), path: "t1[9|1]" },
    ]);
  });

  it("skips a bare position of a clip that isn't there, with no track to name", async () => {
    mockNonExistentObjects();

    await expect(
      duplicate({ type: "clip", id: "nowhere", toPath: "[5|1]" }),
    ).rejects.toThrow(NOWHERE);
  });

  it("skips a scene's arrangement positions, and a count of copies end to end", async () => {
    mockNonExistentObjects();
    setupArrangementSceneMocks(1);

    const result = await duplicate({
      type: "scene",
      id: "nowhere,scene1",
      toPath: "[1|1],[5|1]",
    });

    expect(result).toStrictEqual([
      { path: "[1|1]", ok: false, detail: NOWHERE },
      { clips: [], detail: "the scene has no clips" },
    ]);

    await expect(
      duplicate({ type: "scene", id: "nowhere", toPath: "[3|1]", count: 2 }),
    ).resolves.toStrictEqual([
      { path: "[3|1]", ok: false, detail: NOWHERE },
      { path: "[3|1]", ok: false, detail: NOWHERE },
    ]);
  });

  it("skips every copy a track source was to make", async () => {
    mockNonExistentObjects();

    expect(
      await duplicate({ type: "track", id: "nowhere", count: 2 }),
    ).toStrictEqual([
      { id: "nowhere", ok: false, detail: NOWHERE },
      { id: "nowhere", ok: false, detail: NOWHERE },
    ]);
  });

  it("skips each destination of a device that isn't there", async () => {
    mockNonExistentObjects();

    expect(
      await duplicate({
        type: "device",
        id: "nowhere",
        toPath: "t1/d0,t2/d0",
      }),
    ).toStrictEqual([
      { path: "t1/d0", ok: false, detail: NOWHERE },
      { path: "t2/d0", ok: false, detail: NOWHERE },
    ]);
  });

  it("skips a chain with no destination under the source's own spelling", async () => {
    mockNonExistentObjects();

    await expect(
      duplicate({ type: "chain", id: "nowhere,nowhere2" }),
    ).resolves.toStrictEqual([
      { id: "nowhere", ok: false, detail: NOWHERE },
      { id: "nowhere2", ok: false, detail: 'id "nowhere2" does not exist' },
    ]);
  });

  it("skips a source of another type", async () => {
    mockNonExistentObjects();
    registerMockObject("track1", { path: livePath.track(0), type: "Track" });

    await expect(
      duplicate({ type: "chain", id: "track1,nowhere" }),
    ).resolves.toStrictEqual([
      {
        id: "track1",
        ok: false,
        detail: expect.stringContaining("is not a chain"),
      },
      { id: "nowhere", ok: false, detail: NOWHERE },
    ]);
  });

  it("refuses a lone clip that isn't there, whatever its destination", async () => {
    mockNonExistentObjects();

    await expect(
      duplicate({ type: "clip", id: "nowhere", arrangementStart: "5|1" }),
    ).rejects.toThrow(NOWHERE);
  });
});
