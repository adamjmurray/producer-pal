// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What a drum-pad copy says when its toPath can't be a pad destination.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

const RACK = livePath.track(0).device(0);

/** A Drum Rack on t0/d0 with a kick on C1. */
function registerKit(): void {
  registerMockObject("rack", {
    path: String(RACK),
    type: "RackDevice",
    properties: {
      can_have_drum_pads: [1],
      has_drum_pads: [1],
      drum_pads: children("pad36"),
    },
  });
  registerMockObject("kick", { path: `${RACK} chains 0`, type: "DrumChain" });
  registerMockObject("pad36", {
    path: `${RACK} drum_pads 36`,
    type: "DrumPad",
    properties: { note: [36], chains: children("kick") },
  });
}

describe("duplicate type drum-pad — a toPath that is not a pad", () => {
  beforeEach(() => {
    clearMockRegistry();
    registerKit();
  });

  it.each([["c+"], ["d+"]])(
    "says a pad copy goes onto a whole pad, not onto %s",
    async (marker) => {
      await expect(
        duplicate({
          type: "drum-pad",
          id: "pad36",
          toPath: `t0/d0/pD1/${marker}`,
        }),
      ).rejects.toThrow(
        `invalid toPath "t0/d0/pD1/${marker}" - a drum-pad copy goes onto a ` +
          `whole pad like "t0/d0/pC1", and layers on any chains it has; ` +
          `drop the "${marker}"`,
      );
    },
  );

  // The copy would otherwise land on another rack's pad, or on none.
  it("points a toPath at a rack holding the kit to the kit's own path", async () => {
    registerMockObject("outer-rack", {
      path: String(livePath.track(1).device(0)),
      type: "RackDevice",
      properties: {
        can_have_drum_pads: [0],
        chains: children("outer-chain"),
      },
    });
    registerMockObject("outer-chain", {
      path: String(livePath.track(1).device(0).chain(0)),
      type: "Chain",
      properties: { devices: children("nested-kit") },
    });
    registerMockObject("nested-kit", {
      path: String(livePath.track(1).device(0).chain(0).device(0)),
      type: "RackDevice",
      properties: { can_have_drum_pads: [1], has_drum_pads: [1] },
    });

    await expect(
      duplicate({ type: "drum-pad", id: "pad36", toPath: "t1/d0/pD1" }),
    ).rejects.toThrow(
      'are in different racks — the drum rack is nested; try "t1/d0/c0/d0/pD1"',
    );
  });
});
