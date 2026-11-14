// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The "that chain is now ..." clause only adds to a skip entry, so a lookup
// that fails while working it out leaves the entry as it was.

import { beforeEach, describe, expect, it } from "vitest";
import { registerLayeredDrumRack } from "#src/tools/device/tests/helpers/device-rack-fixtures.ts";
import {
  lookupMockObject,
  mockNonExistentObjects,
} from "#src/test/mocks/mock-registry.ts";
import {
  updateDevice,
  writesThroughSets,
} from "../update-device-test-helpers.ts";

describe("updateDevice - a skip whose path can't be looked up after the writes", () => {
  beforeEach(() => {
    mockNonExistentObjects();
    registerLayeredDrumRack();

    for (const id of ["chain-0", "chain-1", "chain-2"]) {
      writesThroughSets(lookupMockObject(id)!);
    }
  });

  it("keeps the skip as it was when reading the rack fails", () => {
    const rack = lookupMockObject("drum-rack")!;
    const chain = lookupMockObject("chain-0")!;
    const readRack = rack.get.getMockImplementation()!;
    const writeChain = chain.set.getMockImplementation()!;
    let written = false;

    chain.set.mockImplementation((property: string, value: unknown) => {
      writeChain(property, value);
      written = true;
    });
    rack.get.mockImplementation((property: string) => {
      if (written) {
        throw new Error("rack unreadable");
      }

      return readRack(property);
    });

    // chain-0's move lands; chain-1's is refused (the catch-all pad takes no
    // chain), and its path can't be read again afterwards.
    expect(
      updateDevice({
        path: "t0/d0/pC1/c0,t0/d0/pD1/c0",
        toPath: "t0/d0/pD1,t0/d0/p*",
      }),
    ).toStrictEqual([
      expect.objectContaining({ id: "chain-0" }),
      {
        path: "t0/d0/pD1/c0",
        ok: false,
        detail: expect.not.stringContaining("is now"),
      },
    ]);
  });
});
