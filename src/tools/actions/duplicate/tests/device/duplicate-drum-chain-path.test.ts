// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A copy sent to a drum chain comes back spelled the way the toPath wrote it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

vi.mock(
  import("#src/tools/device/update/helpers/update-device-helpers.ts"),
  () => ({
    moveDeviceToPath: vi.fn((): DeviceMoveOutcome => "moved"),
  }),
);

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import {
  type DeviceMoveOutcome,
  moveDeviceToPath as moveDeviceToPathMock,
} from "#src/tools/device/update/helpers/update-device-helpers.ts";

const DRUM_RACK = livePath.track(0).device(0);
/** in_note per rack chain: C1 (36) layered twice, D1 (38) once. */
const CHAIN_NOTES = [36, 38, 36];

describe("duplicate — drum chain path spelling", () => {
  beforeEach(() => {
    registerMockObject("live_set", { path: livePath.liveSet });
    registerMockObject("track-0", { path: livePath.track(0) });
    registerMockObject("drum-rack", {
      path: DRUM_RACK,
      type: "RackDevice",
      properties: {
        class_name: "DrumGroupDevice",
        chains: children("chain-0", "chain-1", "chain-2"),
        can_have_drum_pads: 1,
        return_chains: [],
      },
    });

    for (const [index, inNote] of CHAIN_NOTES.entries()) {
      registerMockObject(`chain-${index}`, {
        path: livePath.track(0).device(0).chain(index),
        type: "DrumChain",
        properties: { in_note: inNote, devices: children() },
      });
    }
  });

  // The mocked move stands in for Live: it relocates the copy into the
  // destination chain and reports the container it landed in, which is what
  // makes the destination safe to name the copy by.
  it("spells a device copy through the pad path the call named", async () => {
    registerMockObject("source-device", {
      path: livePath.track(0).device(1),
      type: "PluginDevice",
    });
    registerMockObject("temp-copy", {
      path: livePath.track(1).device(1),
    });

    vi.mocked(moveDeviceToPathMock).mockImplementationOnce(
      (_device, _toPath, _source, _reportPath, onMoved) => {
        registerMockObject("temp-copy", {
          path: livePath.track(0).device(0).chain(2).device(0),
        });
        onMoved?.(LiveAPI.from("chain-2"));

        return "moved";
      },
    );

    expect(
      await duplicate({
        type: "device",
        id: "source-device",
        toPath: "t0/d0/pC1/c1",
      }),
    ).toStrictEqual({ id: "temp-copy", path: "t0/d0/pC1/c1/d0" });
  });

  // A rack nested inside a drum pad: the copy is a plain chain, but the rack
  // holding it is only reachable through the pad the call spelled.
  it("spells a chain copy through the pad path the call named", async () => {
    const nestedRack = `${DRUM_RACK} chains 2 devices 0`;

    registerMockObject("chain-2", {
      path: `${DRUM_RACK} chains 2`,
      type: "DrumChain",
      properties: { in_note: 36, devices: children("nested-rack") },
    });
    registerMockObject("nested-rack", {
      path: nestedRack,
      type: "RackDevice",
      properties: {
        class_name: "InstrumentGroupDevice",
        has_macro_mappings: 0,
        chains: children("nested-chain-0"),
        return_chains: [],
      },
      methods: { insert_chain: () => ["id", "chain-new"] },
    });
    registerMockObject("nested-chain-0", {
      path: `${nestedRack} chains 0`,
      type: "Chain",
      properties: { name: "Source", mute: 0, solo: 0, devices: children() },
    });
    registerMockObject("chain-new", {
      path: `${nestedRack} chains 1`,
      type: "Chain",
      properties: { name: "", mute: 0, solo: 0, devices: [] },
    });

    expect(
      await duplicate({
        type: "chain",
        id: "nested-chain-0",
        toPath: "t0/d0/pC1/c1/d0",
      }),
    ).toStrictEqual({ id: "chain-new", path: "t0/d0/pC1/c1/d0/c1" });
  });
});
