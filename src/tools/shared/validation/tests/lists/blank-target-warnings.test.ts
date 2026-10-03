// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import "#src/tools/actions/duplicate/tests/duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  capturedWarnings,
  clearCapturedWarnings,
} from "#src/shared/max/v8-warning-capture.ts";
import {
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { deleteObject } from "#src/tools/actions/delete/delete.ts";
import { setupTrackMocks } from "#src/tools/actions/delete/tests/delete-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { registerBareTrackDuplication } from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";
import { updateScene } from "#src/tools/scene/update-scene.ts";
import { playback } from "#src/tools/session/playback.ts";
import { setupPlaybackLiveSet } from "#src/tools/session/tests/playback/playback-test-helpers.ts";
import { updateTrack } from "#src/tools/track/update/update-track.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

// Every tool that takes id and path says when a blank one was dropped. The
// wording is target-lists.test.ts; this holds each tool to saying it, once, and
// only after its work was done.
const BLANK = "   ";

type Targets = { id?: string; path?: string };

const TOOLS: Array<{
  tool: string;
  objects: string;
  /** A path that names one object the setup registers */
  path: string;
  setup: () => void;
  call: (targets: Targets) => unknown;
  /** What the refusal says */
  refusal: string;
  /** A call that is refused whatever its targets */
  refused: (targets: Targets) => unknown;
  /** Says it in the write pipeline's wording, `X ignored: reason` */
  pipeline?: true;
}> = [
  {
    tool: "update-track",
    refusal: "must both be specified",
    objects: "tracks",
    path: "t0",
    setup: () => {
      registerMockObject("123", { path: livePath.track(0) });
    },
    call: (targets) => updateTrack({ ...targets, name: "A" }),
    refused: (targets) => updateTrack({ ...targets, sendGainDb: -6 }),
  },
  {
    tool: "update-scene",
    refusal: "tempo range",
    objects: "scenes",
    path: "s0",
    setup: () => {
      registerMockObject("123", { path: livePath.scene(0) });
    },
    call: (targets) => updateScene({ ...targets, name: "A" }),
    refused: (targets) => updateScene({ ...targets, tempo: 5 }),
    pipeline: true,
  },
  {
    tool: "update-device",
    refusal: "invalid note name",
    objects: "targets",
    path: "t0/d0",
    setup: () => {
      registerMockObject("123", {
        path: livePath.track(0).device(0),
        type: "Device",
      });
    },
    call: (targets) => updateDevice({ ...targets, name: "A" }),
    refused: (targets) =>
      updateDevice({ ...targets, name: "A", mappedPitch: "x" }),
    pipeline: true,
  },
  {
    tool: "delete",
    refusal: "type must be one of",
    objects: "tracks",
    path: "t1",
    setup: () => {
      simulateMockDeletes();
      registerMockObject("live_set", { path: livePath.liveSet });
      setupTrackMocks({ track_2: String(livePath.track(1)) });
    },
    call: (targets) => deleteObject({ ...targets, type: "track" }),
    refused: (targets) => deleteObject({ ...targets, type: "nope" }),
    pipeline: true,
  },
  {
    tool: "duplicate",
    refusal: "type must be one of",
    objects: "tracks",
    path: "t0",
    setup: () => {
      registerBareTrackDuplication();
    },
    call: (targets) => duplicate({ ...targets, type: "track" }),
    refused: (targets) => duplicate({ ...targets, type: "nope" }),
  },
  {
    tool: "playback",
    refusal: "both name clips",
    objects: "scene",
    path: "s0",
    setup: () => {
      setupPlaybackLiveSet();
      registerMockObject("scene0", { path: livePath.scene(0), type: "Scene" });
    },
    call: (targets) => playback({ ...targets, action: "play-scene" }),
    refused: (targets) =>
      playback({ ...targets, action: "play-scene", slots: "x" }),
  },
];

describe("blank id or path on every tool that takes both", () => {
  beforeEach(() => {
    clearCapturedWarnings();
  });

  it.each(TOOLS)(
    "$tool warns once that a blank id was dropped",
    async ({ objects, path, setup, call, pipeline }) => {
      setup();

      await call({ id: BLANK, path });

      expect(capturedWarnings()).toStrictEqual([
        `blank id ignored${pipeline ? ":" : " —"} "path" names the ${objects}`,
      ]);
    },
  );

  it.each(TOOLS)(
    "$tool says nothing when it is refused",
    async ({ path, setup, refusal, refused }) => {
      setup();

      await expect(
        Promise.resolve().then(() => refused({ id: BLANK, path })),
      ).rejects.toThrow(refusal);
      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("blank id ignored"),
      );
    },
  );
});
