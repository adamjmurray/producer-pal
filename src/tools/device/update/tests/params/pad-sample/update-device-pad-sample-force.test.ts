// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  noParamLanded,
  updateDevice,
} from "../../update-device-test-helpers.ts";
import {
  KICK,
  registerCreatedSimpler,
  registerDrumSamplerOn,
  registerPadRack,
  skipSampleWrite,
} from "./pad-sample-fixtures.ts";

// `force` swaps a pad's instrument only after a skip has warned about that pad.

const IGNORED =
  "force:true ignored — nothing had warned about this yet. sample write SKIPPED on pad t0/d0/pC1";

/**
 * Write a sample to the pad C1, with or without force.
 * @param force - Whether to pass force:true
 * @returns The call's result
 */
function writeKick(force: boolean): unknown {
  return updateDevice({
    path: "t0/d0/pC1",
    params: [{ name: "sample", value: KICK }],
    ...(force && { force }),
  });
}

/** @returns A pad holding a Drum Sampler, and the chain that holds it */
function padWithDrumSampler(): RegisteredMockObject {
  const [chain] = registerPadRack();

  registerDrumSamplerOn(chain as RegisteredMockObject);
  registerCreatedSimpler();

  return chain as RegisteredMockObject;
}

describe("updateDevice - force on a pad sample swap", () => {
  it("swaps after a skip, and a second force is unearned again", () => {
    const chain = padWithDrumSampler();

    skipSampleWrite("t0/d0/pC1", "sample");
    expect(chain.call).not.toHaveBeenCalledWith("delete_device", 0);

    writeKick(true);
    expect(chain.call).toHaveBeenCalledWith("delete_device", 0);

    // Put a Drum Sampler back on the pad.
    chain.call.mockClear();
    registerDrumSamplerOn(chain);
    expect(noParamLanded(() => writeKick(true))).toContain(IGNORED);
    expect(chain.call).not.toHaveBeenCalledWith("delete_device", 0);
  });

  it("ignores force before any skip, says so, and keeps the instrument", () => {
    const chain = padWithDrumSampler();

    expect(noParamLanded(() => writeKick(true))).toContain(IGNORED);
    expect(chain.call).not.toHaveBeenCalledWith("delete_device", 0);

    // That skip warned, so force now works.
    writeKick(true);
    expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
  });

  it("counts a skip from the rack shortcut for the pad's own path", () => {
    const chain = padWithDrumSampler();

    skipSampleWrite("t0/d0", "pC1/sample");
    writeKick(true);

    expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
  });

  it("does nothing with force where nothing would be replaced, and records nothing", () => {
    const [chain] = registerPadRack();

    registerCreatedSimpler();
    writeKick(true);
    expect(chain?.call).toHaveBeenCalledWith("insert_device", "Simpler");
    expect(chain?.call).not.toHaveBeenCalledWith("delete_device", 0);

    // The pad now holds a Drum Sampler: the earlier force earned nothing.
    registerDrumSamplerOn(chain as RegisteredMockObject);
    expect(noParamLanded(() => writeKick(true))).toContain(IGNORED);
  });
});
