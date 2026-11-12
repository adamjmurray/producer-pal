// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A device copy to a destination that can't take it is refused before either
// way of copying (the remote script's, a temp track) writes anything to Live:
// no copy to delete, no temp track, no chain made on the way.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  registerMockObject,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import { remoteScriptDown } from "#src/tools/actions/duplicate/helpers/device/remote-script-down-test-helpers.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import { registerFixedChainRack } from "#src/tools/device/tests/helpers/fixed-chain-rack-fixtures.ts";
import { registerGrowingRack } from "#src/tools/device/tests/helpers/growing-rack-fixtures.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  maxError: vi.fn(),
  maxLog: vi.fn(),
  emitWarning: vi.fn(),
  emitWarningOnce: vi.fn(),
}));

/** Every Live object a copy would write through, for checking none was. */
interface World {
  writers: RegisteredMockObject[];
}

/**
 * A Reverb (or the given kind of device) at t0/d1, which no copy of has been
 * made yet, and a live_set to make one through.
 * @param type - The source's Live device type
 * @returns The objects a write would go through
 */
function registerSource(type: number): World {
  const track = registerMockObject("track0", {
    path: livePath.track(0),
    properties: { devices: children("eq", "reverb") },
  });

  registerMockObject("reverb", {
    path: livePath.track(0).device(1),
    properties: { name: "Reverb", type, class_display_name: "Reverb" },
  });

  const liveSet = registerMockObject("live_set", { path: livePath.liveSet });

  return { writers: [track, liveSet] };
}

interface RefusedCase {
  what: string;
  toPath: string;
  /** Registers what the destination is, and what a write there would go through */
  destination: () => RegisteredMockObject[];
  refusal: string | RegExp;
  type?: number;
}

const CASES: RefusedCase[] = [
  {
    what: "a chain on a full fixed-chain rack",
    toPath: "t1/d0/c+",
    destination: () => [registerFixedChainRack(1, "multiband")],
    refusal: "not copied — Multiband Rack (id rack) has a fixed 3 chains",
  },
  {
    what: "a device in a chain a full fixed-chain rack would need",
    toPath: "t1/d0/c5/d+",
    destination: () => [registerFixedChainRack(1, "multiband")],
    refusal: "not copied — Multiband Rack (id rack) has a fixed 3 chains",
  },
  {
    what: "more chains than are made for one path",
    toPath: "t1/d0/c40/d+",
    destination: () => [registerGrowingRack({ track: 1, existing: 1 })],
    refusal: "not copied — Cannot auto-create 40 chains (max: 16)",
  },
  {
    what: "an index past the end",
    toPath: "t1/d5",
    destination: () => [registerFixedChainRack(1, "midSide")],
    refusal:
      'the copy of t0/d1 (id reverb) could not be moved to "t1/d5": "t1/d5" is past the end of a container holding 1 device',
  },
  {
    what: "an index past the end of a chain the path would make",
    toPath: "t1/d0/c9/d2",
    destination: () => [registerGrowingRack({ track: 1, existing: 1 })],
    refusal:
      'the copy of t0/d1 (id reverb) could not be moved to "t1/d0/c9/d2": "t1/d0/c9/d2" is past the end of a container holding 0 devices',
  },
  {
    what: "a chain an audio effect rack would make, for an instrument",
    toPath: "t1/d0/c+",
    destination: () => {
      const rack = registerGrowingRack({ track: 1, existing: 1 });

      rack.properties.type = LIVE_API_DEVICE_TYPE_AUDIO_EFFECT;

      return [rack];
    },
    refusal:
      'the copy of t0/d1 (id reverb) could not be moved to "t1/d0/c+": chain t1/d0/c1 takes only audio effects; "Reverb" is an instrument',
    type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
  },
  {
    what: "a pad path on a rack with no pads",
    toPath: "t1/d0/pC1/d+",
    destination: () => [registerGrowingRack({ track: 1, existing: 1 })],
    refusal: 'not copied — no destination at toPath "t1/d0/pC1/d+"',
  },
  {
    what: "a track that isn't there",
    toPath: "t9/d+",
    destination: () => {
      mockNonExistentObjects();

      return [];
    },
    refusal: 'not copied — no destination at toPath "t9/d+"',
  },
  {
    what: "a place that takes only audio effects",
    toPath: "rt0/d+",
    destination: () => [
      registerMockObject("return0", {
        path: livePath.returnTrack(0),
        properties: { devices: children() },
      }),
    ],
    refusal:
      'return track rt0 (id return0) takes only audio effects; "Reverb" is a MIDI effect',
    type: LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
  },
];

describe("duplicate device - a destination that can't take the copy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each([
    [
      "through the remote script",
      (): void => {
        vi.mocked(requestNode).mockResolvedValue({
          success: true,
          result: { available: true, index: 2 },
        });
      },
    ],
    ["through a temp track", remoteScriptDown],
  ])("%s", (_route, setupRoute) => {
    it.each(CASES)(
      "refuses $what before anything is written",
      async ({ toPath, destination, refusal, type }) => {
        setupRoute();

        const { writers } = registerSource(
          type ?? LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
        );
        const written = [...writers, ...destination()];

        await expect(
          duplicate({ type: "device", id: "reverb", toPath }),
        ).rejects.toThrow(refusal);

        for (const object of written) {
          expect(object.call).not.toHaveBeenCalled();
          expect(object.set).not.toHaveBeenCalled();
        }

        expect(requestNode).not.toHaveBeenCalled();
      },
    );
  });

  // Each copy of a call is its own target: one refused costs only its entry.
  it("skips each refused copy of a call on its own entry", async () => {
    remoteScriptDown();
    registerSource(LIVE_API_DEVICE_TYPE_AUDIO_EFFECT);
    registerFixedChainRack(1, "multiband");

    const result = await duplicate({
      type: "device",
      id: "reverb",
      toPath: "t1/d0/c+,t1/d5",
    });

    expect(result).toStrictEqual([
      expect.objectContaining({
        ok: false,
        detail: expect.stringContaining("has a fixed 3 chains"),
      }),
      expect.objectContaining({
        ok: false,
        detail: expect.stringContaining("is past the end"),
      }),
    ]);
  });
});
