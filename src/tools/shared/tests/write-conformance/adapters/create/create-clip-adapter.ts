// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { expect } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  registerMockObject,
  simulateMockDeletes,
} from "#src/test/mocks/mock-registry.ts";
import { createClip } from "#src/tools/clip/create/create-clip.ts";
import {
  LIVE_FAILURE,
  clearCoveredClips,
  failOnSet,
  hookCalls,
  namedOrder,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

const SCENES = 4;

/** The Live Set and its slots, which a case reaches into to make Live fail. */
interface Session {
  liveSet: RegisteredMockObject;
  slots: RegisteredMockObject[];
}

/**
 * A 4/4 Live Set with four scenes, and a MIDI track whose slots are empty.
 * @returns The Live Set and the slots
 */
function setUpSession(): Session {
  simulateMockDeletes();
  registerMockObject("track0", {
    path: livePath.track(0),
    properties: { has_midi_input: 1 },
  });

  const slots = Array.from({ length: SCENES }, (_, i) =>
    registerMockObject(`slot${i}`, {
      path: livePath.track(0).clipSlot(i),
      properties: { has_clip: 0 },
    }),
  );
  const liveSet = registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: {
      signature_numerator: 4,
      signature_denominator: 4,
      scenes: children(...Array.from({ length: SCENES }, (_, i) => `s${i}`)),
    },
  });

  return { liveSet, slots };
}

/** A second track that takes audio, not MIDI, with an empty slot. */
function audioTrack(): void {
  registerMockObject("track1", {
    path: livePath.track(1),
    properties: { has_midi_input: 0 },
  });
  registerMockObject("t1slot0", {
    path: livePath.track(1).clipSlot(0),
    properties: { has_clip: 0 },
  });
}

/**
 * Slot paths, in the order named.
 * @param order - Scene indexes
 * @returns "t0/s2,t0/s0,..."
 */
function slotPaths(order: number[]): string {
  return order.map((i) => `t0/s${i}`).join(",");
}

export const createClipAdapter: WriteToolAdapter = {
  tool: "ppal-create-clip",
  run: (args) => createClip({ length: "1bar", ...args }),
  na: {
    unparsableDestination:
      "path is the destination, which the unparsable case covers",
    newTwice:
      "a clip goes in a named slot or position; there is no spelling for a new one",
    countWithDestinations: "takes no count",
  },

  many: (n) => {
    setUpSession();

    const order = namedOrder(n);

    return {
      args: { path: slotPaths(order) },
      expected: order.map((i) => ({ path: `t0/s${i}` })),
    };
  },

  repeat: () => {
    setUpSession();

    return {
      args: { path: "t0/s0,t0/s1,t0/s0", name: "A,B,C" },
      keptArgs: { path: "t0/s1,t0/s0", name: "B,C" },
      skipped: [0],
      expected: [{}, { path: "t0/s1" }, { path: "t0/s0" }],
    };
  },

  unparsable: () => {
    setUpSession();

    return { path: "t0/s0,not-a-path" };
  },

  // An arrangement path is read apart from a session slot.
  unparsableModes: [
    () => {
      setUpSession();

      return { path: "t0[1|1],not-a-path" };
    },
  ],

  unappliable: () => {
    setUpSession();
    audioTrack();

    return {
      args: { path: "t0/s0,t1/s0,t0/s1" },
      badIndex: 1,
      landed: [
        { kind: "call", id: "slot0", name: "create_clip" },
        { kind: "call", id: "slot1", name: "create_clip" },
      ],
      expected: [{ path: "t0/s0" }, {}, { path: "t0/s1" }],
    };
  },

  replacedLater: () => {
    setUpSession();
    registerMockObject("track1", {
      path: livePath.track(1),
      properties: { has_midi_input: 1, arrangement_clips: children() },
    });
    clearCoveredClips(
      lookupMockObject("track1") as RegisteredMockObject,
      (args) => Number(args[1]),
    );

    // The second clip, starting earlier and running longer, covers the first
    // whole. (The same spot twice is one place named twice, not a cover.)
    return {
      args: { path: "t1[5|1],t1[4|1]", length: "1bar,3bar" },
      keptArgs: { path: "t1[4|1]", length: "3bar" },
      replaced: [0],
      by: ["t1[4|1]"],
      expected: [{}, { id: expect.any(String), path: "t1[4|1]" }],
    };
  },

  midway: () => {
    const { slots: placed } = setUpSession();

    (placed[1] as RegisteredMockObject).call.mockImplementation(() => {
      throw new Error(LIVE_FAILURE);
    });

    return {
      args: { path: slotPaths([0, 1, 2]) },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [{ path: "t0/s0" }, {}, { path: "t0/s2" }],
    };
  },

  afterChange: () => {
    const { slots: placed } = setUpSession();

    // The clip is made on s1, then the name that goes on it is refused.
    hookCalls(placed[1] as RegisteredMockObject, /^create_clip$/, {
      after: () => {
        failOnSet(
          lookupMockObject(
            undefined,
            "live_set tracks 0 clip_slots 1 clip",
          ) as RegisteredMockObject,
          "name",
        );
      },
    });

    return {
      args: { path: slotPaths([0, 1, 2]), name: "A,B,C" },
      failIndex: 1,
      message: LIVE_FAILURE,
      changed: { id: expect.any(String), path: "t0/s1" },
      landed: "created",
      expected: [{ path: "t0/s0" }, {}, { path: "t0/s2" }],
    };
  },

  wrongLength: () => {
    setUpSession();

    return { path: "t0/s0,t0/s1", name: "A,B,C" };
  },

  refusals: [
    () => {
      setUpSession();

      return { path: "t0/s0,,t0/s1" };
    },
    () => {
      setUpSession();

      return { path: "t0/s0,t0/s1", length: "not-a-length" };
    },
    () => {
      setUpSession();

      return { path: "t0/s0,t0[1|1]", start: "not-a-position" };
    },
  ],

  loneSkipped: () => {
    setUpSession();
    audioTrack();

    return { args: { path: "t1/s0" }, detail: "t1" };
  },
};
