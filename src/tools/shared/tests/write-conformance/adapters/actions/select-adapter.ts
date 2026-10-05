// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { select } from "#src/tools/session/select.ts";
import { registerTracks } from "../../write-conformance-fixtures.ts";
import { type WriteToolAdapter } from "../../write-conformance-types.ts";

const ONE_TARGET = "takes one selection per call: no list, so no entries";

export const selectAdapter: WriteToolAdapter = {
  tool: "ppal-select",
  run: (args) => select(args),
  na: {
    unparsableDestination:
      "no destination list: path names what is selected, which the unparsable case covers",
    order: ONE_TARGET,
    lone: ONE_TARGET,
    namedTwice: ONE_TARGET,
    newTwice: "selects existing objects; nothing is created",
    replacedLater: "selects existing objects; nothing is created or moved",
    unappliable: ONE_TARGET,
    midway: ONE_TARGET,
    afterChange: ONE_TARGET,
    wrongLength: ONE_TARGET,
    countWithDestinations: "takes no count",
  },

  unparsable: () => {
    registerTracks(2);

    return { path: "not-a-path" };
  },

  refusals: [
    () => {
      registerTracks(2);
      mockNonExistentObjects();

      return { path: "t9" };
    },
    () => {
      registerTracks(2);

      return { path: "t0", trackIndex: 1 };
    },
  ],

  loneSkipped: () => {
    registerTracks(2);
    mockNonExistentObjects();

    return { args: { id: "nowhere" }, detail: "nowhere" };
  },
};
