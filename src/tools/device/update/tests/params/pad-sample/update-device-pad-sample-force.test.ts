// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { beginWarningCapture } from "#src/shared/max/v8-warning-capture.ts";
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

/**
 * Assert force was ignored: nothing landed and the instrument stayed.
 * @param chain - The pad's chain
 * @param write - The forced write
 */
function expectForceIgnored(
  chain: RegisteredMockObject,
  write: () => unknown = () => writeKick(true),
): void {
  expect(noParamLanded(write)).toContain(IGNORED);
  expect(chain.call).not.toHaveBeenCalledWith("delete_device", 0);
}

/**
 * Assert force in the next request swaps the instrument out.
 * @param chain - The pad's chain
 */
function expectForceSwapsNextRequest(chain: RegisteredMockObject): void {
  beginWarningCapture();
  writeKick(true);
  expect(chain.call).toHaveBeenCalledWith("delete_device", 0);
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
    beginWarningCapture();
    expectForceIgnored(chain);
  });

  it("ignores force before any skip, says so, and keeps the instrument", () => {
    const chain = padWithDrumSampler();

    expectForceIgnored(chain);

    // That skip warned, so force in the next request works.
    expectForceSwapsNextRequest(chain);
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

  it("does not let a warning about one instrument unlock swapping out another", () => {
    const chain = padWithDrumSampler();

    skipSampleWrite("t0/d0/pC1", "sample");

    // The user puts a different instrument on the pad.
    registerDrumSamplerOn(chain, 0, "ds-2");
    expectForceIgnored(chain);

    // That skip warned about the new instrument, so force now works.
    expectForceSwapsNextRequest(chain);
  });

  it("does not let two spellings of one pad in a call unlock each other", () => {
    const chain = padWithDrumSampler();
    const swapBoth = (): unknown =>
      updateDevice({
        path: "t0/d0",
        params: [
          { name: "pC1/sample", value: KICK },
          { name: "pC1/c0/sample", value: KICK },
        ],
        force: true,
      });

    expectForceIgnored(chain, swapBoth);

    // The call warned, so force in the next request goes ahead.
    expectForceSwapsNextRequest(chain);
  });
});
