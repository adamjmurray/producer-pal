// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import {
  registerClipSlot,
  setupPlaybackLiveSet,
} from "#src/tools/session/tests/playback/playback-test-helpers.ts";
import {
  LIVE_FAILURE,
  manyScenario,
  repeatScenario,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/**
 * Register a Live Set with `count` session clips, ids `c0`, `c1`, ..., on
 * tracks 0..count-1 in scene 0.
 * @param count - How many clips
 * @returns Their clip slots, in order
 */
function setUpClips(count: number): RegisteredMockObject[] {
  setupPlaybackLiveSet();

  return Array.from({ length: count }, (_, i) => {
    registerMockObject(`c${i}`, {
      path: livePath.track(i).clipSlot(0).clip(),
    });

    return registerClipSlot(i, 0);
  });
}

export const playbackAdapter: WriteToolAdapter = {
  tool: "ppal-playback",
  // The session-clip actions are the ones with a list of targets.
  run: (args) => playback({ action: "play-session-clips", ...args }).clip,
  na: {
    unparsableDestination:
      "no destination list: path names what plays, which the unparsable case covers",
    newTwice: "plays existing clips; nothing is created",
    replacedLater: "plays existing clips; nothing is created or moved",
    afterChange:
      "one fire per target, so nothing can have changed before a throw",
    wrongLength:
      "takes no per-target list: every other param applies to the call",
    countWithDestinations: "takes no count",
  },

  many: (n) => {
    setUpClips(n);

    return manyScenario(n, "c", (i) => `t${i}/s0`, false);
  },

  repeat: () => {
    setUpClips(2);
    mockNonExistentObjects();

    return repeatScenario("c", (i) => `t${i}/s0`, false);
  },

  unparsable: () => {
    setUpClips(2);

    return { path: "t0/s0,not-a-path" };
  },

  // The other actions that take a path read it their own way.
  unparsableModes: ["play-scene", "stop-session-clips"].map((action) => () => {
    setUpClips(2);

    return { action, path: "t0/s0,not-a-path" };
  }),

  unappliable: () => {
    setUpClips(2);
    mockNonExistentObjects();

    return {
      args: { id: "c1,999999,c0" },
      badIndex: 1,
      landed: [
        { kind: "call", path: "live_set tracks 1 clip_slots 0", name: "fire" },
        { kind: "call", path: "live_set tracks 0 clip_slots 0", name: "fire" },
      ],
      expected: [{ id: "c1" }, {}, { id: "c0" }],
    };
  },

  midway: () => {
    const slots = setUpClips(3);

    (slots[1] as RegisteredMockObject).call.mockImplementation(() => {
      throw new Error(LIVE_FAILURE);
    });

    return {
      args: { id: "c0,c1,c2" },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [{ id: "c0" }, {}, { id: "c2" }],
    };
  },

  refusals: [
    () => {
      setUpClips(2);

      return { action: "play-session-clips" };
    },
    () => {
      setUpClips(2);

      return { id: "c0,,c1" };
    },
    () => {
      setUpClips(2);

      return { action: "play-scene" };
    },
    // The transport actions read the timeline up front too: stop used to
    // stop first and throw after.
    () => {
      setUpClips(2);

      return { action: "stop", startTime: "garbage" };
    },
  ],

  loneSkipped: () => {
    setUpClips(1);
    mockNonExistentObjects();

    return { args: { id: "999999" }, detail: "999999" };
  },
};
