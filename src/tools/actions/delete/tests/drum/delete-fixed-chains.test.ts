// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live has no way to delete a rack chain, and a Live 13 rack with fixed chains
// is no exception: the chain stays, and its entry says so.

import { beforeEach, describe, expect, it } from "vitest";
import "#src/live-api-adapter/live-api-extensions.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { registerFixedChainRack } from "#src/tools/device/tests/helpers/fixed-chain-rack-fixtures.ts";
import { deleteObject } from "../../delete.ts";

const REFUSAL = (path: string, id: string): string =>
  `chain ${path} (id ${id}) is not on a drum pad. Live has no way to ` +
  `delete a rack chain, and only a drum pad's chains can be removed.`;

describe("deleteObject — a chain of a rack with fixed chains", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("refuses the chain and leaves the rack alone", () => {
    const rack = registerFixedChainRack(0, "midSide");

    expect(() => deleteObject({ id: "chain-1", type: "chain" })).toThrow(
      REFUSAL("t0/d0/c1", "chain-1"),
    );
    expect(rack.call).not.toHaveBeenCalled();
  });

  it("keeps the refusal in the chain's slot in a list", () => {
    registerFixedChainRack(0, "multiband");

    expect(
      deleteObject({ id: "chain-0, chain-2", type: "chain" }),
    ).toStrictEqual([
      { id: "chain-0", ok: false, detail: REFUSAL("t0/d0/c0", "chain-0") },
      { id: "chain-2", ok: false, detail: REFUSAL("t0/d0/c2", "chain-2") },
    ]);
  });
});
