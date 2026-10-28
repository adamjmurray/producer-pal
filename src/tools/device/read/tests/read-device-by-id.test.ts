// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// An id a read hands out has to read back, and an id of another kind is refused
// rather than described as an empty device.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  MIXER_TYPES,
  registerMixer,
} from "#src/tools/device/tests/helpers/non-device-fixtures.ts";
import { readDevice, readOneDevice } from "../read-device.ts";
import { setupChainMock } from "./read-device-test-helpers.ts";
import { setupDrumPadMocks } from "./drum/read-device-drum-mocks.ts";

describe("readOneDevice by id of a chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("reads a chain id the way its path reads", () => {
    setupChainMock({ id: "chain-21", name: "Bass" });

    const byId = readOneDevice({ id: "chain-21" });

    expect(byId).toStrictEqual(readOneDevice({ path: "t1/d0/c0" }));
    expect(byId).toStrictEqual(
      expect.objectContaining({ id: "chain-21", path: "t1/d0/c0" }),
    );
  });

  it("reads a drum chain id back", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: {
        "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1"] },
      },
      chainProperties: { "chain-1": { name: "Layer 1" } },
    });

    expect(readOneDevice({ id: "chain-1" })).toStrictEqual(
      expect.objectContaining({
        id: "chain-1",
        name: "Layer 1",
        type: "drum-chain",
      }),
    );
  });

  // Live can hand back a drum chain's path through its pad. That names the
  // chain by an index within the pad, so the read gives no path at all rather
  // than a wrong one.
  it("gives no path for a drum chain Live placed under its pad", () => {
    registerMockObject("chain-1", {
      path: `${livePath.track(1).device(0)} drum_pads 36 chains 0`,
      type: "DrumChain",
      properties: { name: "Layer 1", in_note: 36, devices: [] },
    });

    const result = readOneDevice({ id: "chain-1" });

    expect(result).toStrictEqual(
      expect.objectContaining({
        id: "chain-1",
        name: "Layer 1",
        type: "drum-chain",
      }),
    );
    expect(result).not.toHaveProperty("path");
  });
});

describe("readDevice by id of something that is not a device", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("refuses a track, in the words update-device uses", () => {
    registerMockObject("999", { path: livePath.track(3), type: "Track" });

    expect(() => readOneDevice({ id: "999" })).toThrow(
      "cannot read a track: t3 (id 999)",
    );
  });

  it.each(MIXER_TYPES)("refuses a %s, which is not a device", (type) => {
    registerMixer(type);

    expect(() => readOneDevice({ id: "mix-1" })).toThrow(
      "cannot read a mixer: id mix-1",
    );
  });

  it("keeps its slot when a readable target was named too", async () => {
    registerMockObject("999", { path: livePath.track(3), type: "Track" });
    setupChainMock({ id: "chain-21" });

    expect(await readDevice({ id: "999,chain-21" })).toStrictEqual([
      { id: "999", ok: false, detail: "cannot read a track: t3 (id 999)" },
      expect.objectContaining({ id: "chain-21" }),
    ]);
  });
});
