// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  afterRenameScenario,
  manyScenario,
  repeatScenario,
  replaceClipOnCopy,
} from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

/**
 * Register `count` MIDI clips, ids `c0`, `c1`, ..., one per track in scene 0.
 * @param count - How many
 * @returns The clips, in order
 */
function setUpClips(count: number): RegisteredMockObject[] {
  registerMockObject("live_set", {
    path: livePath.liveSet,
    properties: { signature_numerator: 4, signature_denominator: 4 },
  });

  return Array.from({ length: count }, (_, i) => {
    registerMockObject(`track${i}`, { path: livePath.track(i) });
    registerMockObject(`slot${i}`, {
      path: livePath.track(i).clipSlot(0),
      properties: { has_clip: 1 },
    });

    return registerMockObject(`c${i}`, {
      path: livePath.track(i).clipSlot(0).clip(),
      properties: { is_midi_clip: 1, is_arrangement_clip: 0 },
    });
  });
}

export const updateClipAdapter: WriteToolAdapter = {
  tool: "ppal-update-clip",
  run: (args) => updateClip(args),
  na: {
    newTwice: "updates existing clips; nothing is created",
    countWithDestinations: "takes no count",
  },

  many: (n) => {
    setUpClips(n);

    return manyScenario(n, "c", (i) => `t${i}/s0`);
  },

  repeat: () => {
    setUpClips(2);

    return repeatScenario("c", (i) => `t${i}/s0`);
  },

  unparsable: () => {
    setUpClips(2);

    return { path: "t0/s0,not-a-path", name: "A,B" };
  },

  unparsableDestinations: [
    () => {
      setUpClips(2);

      // The rename lands on nothing: the bad entry refuses the whole call.
      return { id: "c0,c1", toPath: "t2/s0,not-a-path", name: "A,B" };
    },
  ],

  unappliable: () => {
    setUpClips(2);
    mockNonExistentObjects();

    return {
      args: { id: "c1,nowhere,c0", name: "A,B,C" },
      badIndex: 1,
      landed: [
        { kind: "set", id: "c1", name: "name", args: ["A"] },
        { kind: "set", id: "c0", name: "name", args: ["C"] },
      ],
      expected: [{ id: "c1", path: "t1/s0" }, {}, { id: "c0", path: "t0/s0" }],
    };
  },

  replacedLater: () => {
    setUpClips(3);

    for (const slot of [0, 1]) {
      replaceClipOnCopy(
        lookupMockObject(
          undefined,
          `live_set tracks ${slot} clip_slots 0`,
        ) as RegisteredMockObject,
      );
    }

    registerMockObject("slot-dest", {
      path: livePath.track(2).clipSlot(1),
      properties: { has_clip: 0 },
    });

    // Both clips go to one slot: the second replaces the first.
    return {
      args: { id: "c0,c1", toPath: "t2/s1,t2/s1" },
      keptArgs: { id: "c1", toPath: "t2/s1" },
      replaced: [0],
      by: ["t2/s1"],
      expected: [{}, { path: "t2/s1" }],
    };
  },

  midway: () => {
    const clips = setUpClips(3);

    failOnSet(clips[1] as RegisteredMockObject);

    return {
      args: { id: "c0,c1,c2", name: "A,B,C" },
      failIndex: 1,
      message: LIVE_FAILURE,
      expected: [{ id: "c0" }, {}, { id: "c2" }],
    };
  },

  // The name goes on, then the color is refused.
  afterChange: () =>
    afterRenameScenario(setUpClips(3), "c", "color", "#ff0000"),

  wrongLength: () => {
    setUpClips(2);

    return { id: "c0,c1", name: "A,B,C" };
  },

  refusals: [
    () => {
      setUpClips(2);

      return { name: "A" };
    },
    () => {
      setUpClips(2);

      return { id: "c0,,c1", name: "A,B" };
    },
    () => {
      setUpClips(2);

      return { id: "c0,c1", toPath: "t2/s0" };
    },
    () => {
      setUpClips(2);

      return { id: "c0,c1", start: "not-a-position" };
    },
  ],

  loneSkipped: () => {
    setUpClips(2);
    mockNonExistentObjects();

    return { args: { id: "nowhere", name: "A" }, detail: "nowhere" };
  },
};
