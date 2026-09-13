// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Build budget for select.
//
// select checks its target is there, selects it, then reads it back for the
// response — three passes over the same object, each starting from the path or
// id string again. So the number to watch is how many times one target gets
// resolved for one call, and whether a second target costs more than the first.
//
// These count resolutions rather than asserting output, so they catch a NEW
// repeat: a count that climbs means a pass got added over a target that was
// already in hand. Several of the numbers here are higher than ideal — the
// comments say which, and why they are what they are today.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiBuildStats } from "#src/live-api-adapter/live-api-build-stats.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { select } from "#src/tools/session/select.ts";
import {
  resetSelectTestState,
  setupAppViewMock,
  setupSongViewMock,
} from "./select-test-helpers.ts";

vi.mock(
  import("#src/tools/shared/helpers/live-api-values.ts"),
  async (importOriginal) => {
    const { selectLiveApiValuesMockBody } =
      await import("./select-test-helpers.ts");

    return selectLiveApiValuesMockBody(await importOriginal());
  },
);

const TRACK = "live_set tracks *";
const DEVICE = "live_set tracks * devices *";
const SCENE = "live_set scenes *";
const SLOT = "live_set tracks * clip_slots *";
const SLOT_CLIP = "live_set tracks * clip_slots * clip";

/** Every call builds the app view and the song view, whatever it selects. */
const VIEWS = 2;

/**
 * How many times the call resolved a target of this shape.
 * @param shape - Target shape, indices replaced with `*`
 * @returns Resolution count
 */
function resolves(shape: string): number {
  return liveApiBuildStats().byShape.find(([name]) => name === shape)?.[1] ?? 0;
}

/** One track holding a rack and a plain device, one scene, one filled slot. */
function setupSet(): void {
  resetSelectTestState();
  setupAppViewMock();
  setupSongViewMock();

  registerMockObject("track_0", {
    path: livePath.track(0),
    type: "Track",
    properties: { has_midi_input: 1, devices: children("rack", "device_1") },
  });
  registerMockObject("rack", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { can_have_chains: 1, chains: children("chain_1") },
  });
  registerMockObject("device_1", {
    path: livePath.track(0).device(1),
    type: "Device",
  });
  registerMockObject("scene_3", { path: livePath.scene(3), type: "Scene" });
  registerMockObject("clipslot_0_3", {
    path: livePath.track(0).clipSlot(3),
    type: "ClipSlot",
    properties: { has_clip: 1 },
  });
  registerMockObject("clip_0_3", {
    path: livePath.track(0).clipSlot(3).clip(),
    type: "Clip",
  });
}

describe("select build budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSet();
  });

  // One resolution of the device: the existence check resolves it, and the
  // selection and response steps reuse that same object instead of rebuilding
  // it from the path string.
  it("resolves a device path once", () => {
    select({ path: "t0/d1" });

    expect(resolves(DEVICE)).toBe(1);

    // A device path resolves by string building, so nothing above the target
    // is built. Selecting the same device by id does build its track — see the
    // id budget below.
    expect(resolves(TRACK)).toBe(0);

    // The two views and the one device build, and nothing else.
    expect(liveApiBuildStats().resolved).toBe(VIEWS + 1);
  });

  // Two: an id is type-detected first, then re-resolved to select it. The
  // response reuses the object the selection step returned. With a single id
  // there is nothing to compare it against, so no track gets built.
  it("resolves a device id twice, and builds no track to compare with nothing", () => {
    select({ deviceId: "device_1" });

    expect(resolves("device_*")).toBe(2);
    expect(resolves(TRACK)).toBe(0);
  });

  // The slot is resolved to check it exists, to write highlighted_clip_slot,
  // and again to read has_clip; the clip in it twice, once to focus it and
  // once to report it.
  //
  // The track and the scene are built only so a missing slot can say which
  // half is missing. The slot resolving at all already proves both are there,
  // so those two are the cost of the better error message.
  it("resolves a clip slot three times and builds its track and scene to name a failure", () => {
    select({ path: "t0/s3" });

    expect(resolves(SLOT)).toBe(3);
    expect(resolves(SLOT_CLIP)).toBe(2);
    expect(resolves(TRACK)).toBe(1);
    expect(resolves(SCENE)).toBe(1);
  });

  // Two ids that name nothing in common cost exactly two targets: three
  // resolutions each (detect the type, select it, read it back for the
  // response), over the two views every call pays. No term grows with the
  // number of targets.
  it("costs one target's worth per target when the ids are unrelated", () => {
    select({ trackId: "track_0", sceneId: "scene_3" });

    expect(resolves("track_*")).toBe(2);
    expect(resolves("id track_*")).toBe(1);
    expect(resolves("scene_*")).toBe(2);
    expect(resolves("id scene_*")).toBe(1);
    expect(liveApiBuildStats().resolved).toBe(VIEWS + 3 + 3);
  });

  // Related ids are the exception: a track id and a device id have to name the
  // same track, and checking that re-resolves the device and builds its track
  // once more. Apart the two calls cost VIEWS + 3 and VIEWS + 2; together they
  // cost one more of each than the flat sum, and that gap is the check.
  it("adds a cross-check when a track id and a device id have to agree", () => {
    select({ trackId: "track_0", deviceId: "device_1" });

    expect(resolves("device_*")).toBe(3);
    expect(resolves(TRACK)).toBe(1);
    expect(liveApiBuildStats().resolved).toBe(VIEWS + 3 + 3 + 1);
  });
});
