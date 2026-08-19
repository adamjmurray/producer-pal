// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// duplicate and delete both hand back drum pad ids, so a read by id has to
// answer the same thing a read by path does — including the path itself, which
// is what the caller needs to write to the pad afterward.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readDevice } from "../read-device.ts";
import { setupDrumPadMocks } from "./read-device-drum-mocks.ts";

describe("readDevice with a drum pad id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads a pad by id, and names the path that reaches it", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: { "pad-36": { note: 36, name: "Kick" } },
    });

    expect(readDevice({ deviceId: "pad-36" })).toStrictEqual({
      id: "pad-36",
      path: "t1/d0/pC1",
      name: "Kick",
      note: 36,
      pitch: "C1",
    });
  });

  // By path the pitch is echoed as written; by id it is spelled the one way
  // midiToNoteName spells it, so a caller who wrote "pF#1" reads back "pGb1".
  it("matches what the same pad reads as by path", () => {
    setupDrumPadMocks({
      padIds: ["pad-42"],
      padProperties: { "pad-42": { note: 42, name: "Hat", solo: 1 } },
    });

    expect(readDevice({ deviceId: "pad-42" })).toStrictEqual(
      readDevice({ path: "t1/d0/pGb1" }),
    );
  });

  it("lists the pad's chains when they are requested", () => {
    setupDrumPadMocks({
      padIds: ["pad-36"],
      padProperties: {
        "pad-36": { note: 36, name: "Kick", chainIds: ["chain-1", "chain-2"] },
      },
      chainProperties: {
        "chain-1": { name: "Layer 1" },
        "chain-2": { name: "Layer 2" },
      },
    });

    const result = readDevice({ deviceId: "pad-36", include: ["chains"] });

    expect(result.chains).toMatchObject([
      { id: "chain-1", path: "t1/d0/pC1/c0", name: "Layer 1" },
      { id: "chain-2", path: "t1/d0/pC1/c1", name: "Layer 2" },
    ]);
  });
});
