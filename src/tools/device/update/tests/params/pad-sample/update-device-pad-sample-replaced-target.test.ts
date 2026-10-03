// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  updateDevice,
} from "../../update-device-test-helpers.ts";
import {
  KICK,
  registerCreatedSimpler,
  registerDrumSamplerOn,
  registerPadRack,
} from "./pad-sample-fixtures.ts";

/**
 * Run the forced swap, with the deleted device and the pad named as given.
 * @param naming - The id and path params that name them
 * @returns The call's entries
 */
function swapWith(naming: Record<string, string>): unknown {
  const [chain] = registerPadRack();
  const sampler = registerDrumSamplerOn(chain as RegisteredMockObject);

  registerCreatedSimpler();

  // Live drops the deleted device's address.
  (chain as RegisteredMockObject).methods.delete_device = () => {
    sampler.path = "";

    return null;
  };

  return updateDevice({
    ...naming,
    name: "Renamed",
    force: true,
    params: [{ name: "sample", value: KICK }],
  });
}

const GONE = expect.stringContaining(
  "no longer exists: a later target in this call replaced it",
);

// A deleted object's result path is where it was before the call, since it has
// no address after it. Every other entry names its object where it is now.
describe("updateDevice - a device a later target's pad sample swap deletes", () => {
  it("keeps the path it had before the call, and says it is gone", () => {
    expect(swapWith({ id: "ds-1", path: "t0/d0/pC1" })).toStrictEqual([
      expect.objectContaining({
        id: "ds-1",
        path: "t0/d0/pC1/c0/d0",
        detail: GONE,
      }),
      expect.objectContaining({ id: "pad-36", path: "t0/d0/pC1" }),
    ]);
  });

  it("keeps it in the spelling the call used", () => {
    expect(swapWith({ path: "t0/d0/pC1/c0/d0,t0/d0/pC1" })).toStrictEqual([
      expect.objectContaining({
        id: "ds-1",
        path: "t0/d0/pC1/c0/d0",
        detail: GONE,
      }),
      expect.objectContaining({ id: "pad-36", path: "t0/d0/pC1" }),
    ]);
  });
});
