// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget tests for copying scenes to the arrangement. A scene copy reads the
// scene's clips for its length, for what it covers and to write, and none of
// those moves, so one pass over the scene serves the call.

import { describe, expect, it } from "vitest";
import {
  beginLiveApiBuildStats,
  liveApiBuildStats,
} from "#src/live-api-adapter/live-api-build-stats.ts";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  createStandardMidiClipMock,
  registerClipSlot,
  registerMockObject,
  setupArrangementSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";

const TRACKS = 6;

/**
 * A scene holding a clip on each of TRACKS tracks, and a scene after it with
 * the same, with tracks that answer arrangement copies.
 */
function setupScenes(): void {
  setupArrangementSceneMocks(TRACKS);
  registerMockObject("scene2", { path: livePath.scene(1) });

  for (let track = 0; track < TRACKS; track++) {
    registerClipSlot(track, 0, true, createStandardMidiClipMock());
    registerClipSlot(track, 1, true, createStandardMidiClipMock());
    registerTrackWithArrangementDup(track);

    for (let clip = 0; clip < 6; clip++) {
      registerArrangementClip(track, clip, 16 + clip * 16);
    }
  }
}

/**
 * How many objects one scene call resolved, on a fresh Set.
 * @param args - The call's scene params
 * @returns Resolutions for the call
 */
async function resolvedBy(
  args: Partial<Parameters<typeof duplicate>[0]>,
): Promise<number> {
  setupScenes();
  beginLiveApiBuildStats();
  await duplicate({ type: "scene", ...args });

  return liveApiBuildStats().resolved;
}

describe("duplicate scene build budget", () => {
  // Each count includes the call's fixed reads. Before the scene was read once
  // per call these were 102, 270 and 201: length, covers and the write each
  // walked every track's slots again.
  it("reads the scene once for one position", async () => {
    expect(await resolvedBy({ id: "scene1", arrangementStart: "5|1" })).toBe(
      54,
    );
  });

  it("reads the scene once for three positions", async () => {
    expect(
      await resolvedBy({ id: "scene1", arrangementStart: "5|1,9|1,13|1" }),
    ).toBe(126);
  });

  it("reads each scene once for two scenes", async () => {
    expect(
      await resolvedBy({ id: "scene1,scene2", arrangementStart: "5|1,13|1" }),
    ).toBe(105);
  });

  // The sources, the Set and its tracks: no slot of the scene is looked at.
  it("reads nothing of the scene's clips when it copies none", async () => {
    expect(
      await resolvedBy({
        id: "scene1,scene2",
        arrangementStart: "5|1,13|1",
        withoutClips: true,
      }),
    ).toBe(7);
  });
});
