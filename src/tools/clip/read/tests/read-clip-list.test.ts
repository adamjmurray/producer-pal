// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import {
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readClip } from "../read-clip.ts";

/**
 * Register two tracks and two scenes, with a clip in t0/s0 and t1/s0 and
 * nothing in t0/s1.
 */
function setupClips(): void {
  for (const index of [0, 1]) {
    registerMockObject(`track${index}`, {
      path: livePath.track(index),
      type: "Track",
      properties: { has_midi_input: 1 },
    });
    registerMockObject(`scene${index}`, {
      path: livePath.scene(index),
      type: "Scene",
    });
    registerMockObject(`clip${index}`, {
      path: livePath.track(index).clipSlot(0).clip(),
      type: "Clip",
      properties: { is_midi_clip: 1, name: `Clip ${index}` },
    });
  }
}

const clip0 = {
  id: "clip0",
  type: "midi",
  name: "Clip 0",
  view: "session",
  path: "t0/s0",
};
const clip1 = {
  id: "clip1",
  type: "midi",
  name: "Clip 1",
  view: "session",
  path: "t1/s0",
};

describe("readClip over a list of targets", () => {
  beforeEach(() => {
    setupClips();
    mockNonExistentObjects();
  });

  it("reads one clip per id, in the order named", async () => {
    expect(await readClip({ id: "clip1,clip0" })).toStrictEqual([clip1, clip0]);
  });

  it("reads one clip per path, in the order named", async () => {
    expect(await readClip({ path: "t1/s0, t0/s0" })).toStrictEqual([
      clip1,
      clip0,
    ]);
  });

  it("reads ids and paths together, ids first", async () => {
    expect(await readClip({ id: "clip1", path: "t0/s0" })).toStrictEqual([
      clip1,
      clip0,
    ]);
  });

  it("takes the list from the ids and paths aliases", async () => {
    expect(await readClip({ ids: "clip0", paths: "t1/s0" })).toStrictEqual([
      clip0,
      clip1,
    ]);
  });

  it("turns an empty slot into a miss, without warning", async () => {
    expect(await readClip({ path: "t0/s0,t0/s1" })).toStrictEqual([
      clip0,
      { path: "t0/s1", ok: false, reason: "no clip at t0/s1" },
    ]);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("reports a miss by id the way the caller wrote it", async () => {
    expect(await readClip({ id: "clip0,nope" })).toStrictEqual([
      clip0,
      { id: "nope", ok: false, reason: 'id "nope" does not exist' },
    ]);
  });

  it("unwraps a single target", async () => {
    expect(await readClip({ path: "t0/s0" })).toStrictEqual(clip0);
  });

  it("throws when the only target is an empty slot", async () => {
    await expect(readClip({ path: "t0/s1" })).rejects.toThrow(
      "no clip at t0/s1",
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("still throws when the only target names nothing", async () => {
    await expect(readClip({ id: "nope" })).rejects.toThrow(
      'id "nope" does not exist',
    );
  });

  it("refuses a list with an empty entry", async () => {
    await expect(readClip({ path: "t0/s0,,t1/s0" })).rejects.toThrow(
      'invalid path "t0/s0,,t1/s0" - it has an empty entry',
    );
  });

  it("applies include to every entry", async () => {
    expect(
      await readClip({ path: "t0/s0,t1/s0", include: ["color"] }),
    ).toStrictEqual(
      [clip0, clip1].map((clip) => ({ ...clip, color: "#3DC300" })),
    );
  });

  // Each target param is read once, before the targets are split: reading a
  // second time per entry said the same thing over and over.
  it("says once that a path names nothing", async () => {
    expect(await readClip({ id: "clip0", path: "null" })).toStrictEqual(clip0);
    expect(capturedWarnings()).toStrictEqual(['path "null" names nothing']);
  });

  it("names the blank spelling the caller wrote, alias included", async () => {
    expect(await readClip({ clipId: "  ", path: "t0/s0" })).toStrictEqual(
      clip0,
    );
    expect(capturedWarnings()).toStrictEqual([
      'blank clipId ignored — "path" names the clips',
    ]);
  });

  it("says nothing about a blank id the alias stood in for", async () => {
    expect(
      await readClip({ id: "  ", clipId: "clip1", path: "t0/s0" }),
    ).toStrictEqual([clip1, clip0]);
    expect(capturedWarnings()).toStrictEqual([]);
  });
});

// A location param names one clip on its own, so beside a list every entry
// would read that clip, or be refused for naming two places at once.
describe("readClip with a deprecated location param", () => {
  beforeEach(() => {
    setupClips();
    mockNonExistentObjects();
  });

  it("still reads the slot trackIndex/sceneIndex names", async () => {
    expect(await readClip({ trackIndex: 0, sceneIndex: 0 })).toStrictEqual(
      clip0,
    );
  });

  it("still reads the slot the slot param names", async () => {
    expect(await readClip({ slot: "1/0" })).toStrictEqual(clip1);
  });

  it("refuses trackIndex/sceneIndex beside a list", async () => {
    await expect(
      readClip({ id: "clip0,clip1", trackIndex: 0, sceneIndex: 0 }),
    ).rejects.toThrow(
      "trackIndex/sceneIndex names one clip, but id and path name 2. " +
        "Name every clip with id or path, or drop trackIndex/sceneIndex.",
    );
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("refuses slot beside a list", async () => {
    await expect(readClip({ path: "t0/s0,t1/s0", slot: "," })).rejects.toThrow(
      "slot names one clip, but id and path name 2",
    );
  });
});
