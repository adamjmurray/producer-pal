// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { updateTrack } from "#src/tools/track/update/update-track.ts";
import { registerTracks } from "../../write-conformance-fixtures.ts";
import { updateByIdAdapter } from "./update-by-id-adapter.ts";

export const updateTrackAdapter = updateByIdAdapter({
  tool: "ppal-update-track",
  run: (args) => updateTrack(args),
  prefix: "t",
  nouns: "tracks",
  register: registerTracks,
  lateProp: { name: "mute", value: true },
  refusedProp: { name: "sendGainDb", value: -3 },
  // A take lane path is planned apart from a track path.
  unparsableModes: (register) => [
    () => {
      register(2);

      return { path: "t0/l0,not-a-path", name: "A,B" };
    },
  ],
});
