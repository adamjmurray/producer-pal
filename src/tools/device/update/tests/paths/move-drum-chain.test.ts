// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { newTargetNotes } from "#src/tools/shared/helpers/target-notes.ts";
import { moveDrumChainToPath } from "../../helpers/move-drum-chain.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("moveDrumChainToPath", () => {
  let chain: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("drumrack-id", {
      path: livePath.track(0).device(0),
      type: "RackDevice",
      properties: {
        can_have_drum_pads: 1,
        chains: children("chain-0"),
      },
    });

    chain = registerMockObject("chain-0", {
      path: livePath.track(0).device(0).chain(0),
      type: "DrumChain",
      properties: { in_note: 36 },
    });
  });

  it("says what the track holds when toPath names nothing by type", () => {
    registerMockObject("track-0", {
      path: livePath.track(0),
      properties: { devices: children("drumrack-id") },
    });

    const notes = newTargetNotes();

    moveDrumChainToPath([LiveAPI.from(chain.path)], "t0/afx0/pD1", notes);

    expect(notes).toStrictEqual({
      said: ['nothing at toPath "t0/afx0/pD1": t0 has no audio effects'],
      refused: ["toPath"],
    });
    expect(chain.set).not.toHaveBeenCalled();
  });

  it("should skip when toPath has out-of-range note", () => {
    const chainApi = LiveAPI.from(chain.path);
    const notes = newTargetNotes();

    // G9 is note 139, past MIDI's 127, so no pad answers to it.
    moveDrumChainToPath([chainApi], "t0/d0/pG9", notes);

    expect(notes.said).toContain('toPath "t0/d0/pG9" is not a drum pad path');
    expect(chain.set).not.toHaveBeenCalled();
  });
});
