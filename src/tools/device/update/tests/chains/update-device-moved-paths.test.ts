// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A skip entry repeats the caller's path. A drum chain move re-numbers the
// chains on the pad it lands on, so that path can name another chain by the end
// of the call; the entry says where its own chain went.

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

describe("updateDevice - a skip whose chain path another move re-numbered", () => {
  beforeEach(() => {
    mockNonExistentObjects();
    // Pad C1 holds chain-0 and chain-2, pad D1 holds chain-1. A chain follows
    // its pad, which is its `in_note`.
    registerLayeredDrumRack();

    for (const id of ["chain-0", "chain-1", "chain-2"]) {
      writesThroughSets(lookupMockObject(id)!);
    }
  });

  it("says where the chain that wasn't moved sits now", () => {
    // chain-0 lands on D1 ahead of chain-1, so pD1/c0 is chain-0 by the end.
    // chain-1's own move is refused: the catch-all pad can't take a chain.
    expect(
      updateDevice({
        path: "t0/d0/pC1/c0,t0/d0/pD1/c0",
        toPath: "t0/d0/pD1,t0/d0/p*",
      }),
    ).toStrictEqual([
      expect.objectContaining({ id: "chain-0", path: "t0/d0/pD1/c0" }),
      {
        path: "t0/d0/pD1/c0",
        ok: false,
        detail: expect.stringMatching(
          /; that chain is now t0\/d0\/pD1\/c1 \(id chain-1\)$/,
        ),
      },
    ]);
  });

  it("leaves the skip alone when no move touched its pad", () => {
    // The only move leaves pad D1 as it was.
    expect(
      updateDevice({
        path: "t0/d0/pC1/c0,t0/d0/pD1/c0",
        toPath: "t0/d0/pF1,t0/d0/p*",
      }),
    ).toStrictEqual([
      expect.objectContaining({ id: "chain-0", path: "t0/d0/pF1/c0" }),
      {
        path: "t0/d0/pD1/c0",
        ok: false,
        detail: expect.not.stringContaining("is now"),
      },
    ]);
  });

  it("says a path that named nothing now names a chain", () => {
    // pD1/c1 is past D1's one chain until chain-0 lands there.
    expect(
      updateDevice({
        path: "t0/d0/pC1/c0,t0/d0/pD1/c1",
        toPath: "t0/d0/pD1,t0/d0/pF1",
      }),
    ).toStrictEqual([
      expect.objectContaining({ id: "chain-0", path: "t0/d0/pD1/c0" }),
      {
        path: "t0/d0/pD1/c1",
        ok: false,
        detail: expect.stringMatching(
          /; nothing was there when the call began$/,
        ),
      },
    ]);
  });
});
