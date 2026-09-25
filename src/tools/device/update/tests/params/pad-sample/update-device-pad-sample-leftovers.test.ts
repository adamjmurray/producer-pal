// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  noParamLanded,
  paramsOf,
  updateDevice,
} from "../../update-device-test-helpers.ts";
import {
  KICK,
  registerChainInsertingNothing,
  registerCreatedSimpler,
  registerDrumRackWithC1,
  registerDrumRackWithDrumSamplerOnC1,
  registerDrumSamplerOn,
  registerPadRack,
  registerUnbuiltPadChain,
} from "./pad-sample-fixtures.ts";

// A sample write that fails doesn't undo what the call made for it: that stays,
// and the entry says what was left. The call changed the Set, so it never
// throws. The rack's `pC1/sample` shortcut and the pad's own path say it the
// same way.

/** An absolute path Live finds no file at: it loads nothing, and says nothing. */
const MISSING = "/Library/missing.wav";
const NOTHING_READ = "written, but no value reads back";
const LEFT_SIMPLER = "left an empty Simpler on pad t0/d0/pC1";
const NO_SIMPLER = "failed to create a Simpler on the drum pad";

/**
 * Register the Simpler a pad chain auto-creates, loading nothing it's handed.
 * @param chainIndex - Which layer it lands in
 */
function registerSimplerThatLoadsNothing(chainIndex = 0): void {
  registerCreatedSimpler(chainIndex).call.mockImplementation(() => undefined);
}

/**
 * The one param entry a sample write reports.
 * @param path - What the call addresses
 * @param name - The param name the call sends
 * @param value - The sample
 * @param force - Whether to pass force:true
 * @returns The param entries
 */
function writeSample(
  path: string,
  name: string,
  value: string,
  force = false,
): unknown[] {
  return paramsOf(
    updateDevice({ path, params: [{ name, value }], ...(force && { force }) }),
  );
}

/**
 * The entry a failed write should report.
 * @param name - The param name the call sent
 * @param detail - What it says
 * @returns The expected entry list
 */
function failed(name: string, detail: string): unknown[] {
  return [{ name, ok: false, detail }];
}

describe("updateDevice - what a failed pad sample write left, by the rack", () => {
  it("says it left an empty Simpler when the path was refused", () => {
    registerDrumRackWithC1();

    expect(writeSample("t0/d0", "pC1/sample", "snare.wav")).toStrictEqual(
      failed(
        "pC1/sample",
        `'sample' must be an absolute file path (got "snare.wav"); ${LEFT_SIMPLER}`,
      ),
    );
  });

  it("says it left an empty Simpler when no file was found", () => {
    registerDrumRackWithC1();
    registerSimplerThatLoadsNothing();

    expect(writeSample("t0/d0", "pC1/sample", MISSING)).toStrictEqual(
      failed("pC1/sample", `${NOTHING_READ}; ${LEFT_SIMPLER}`),
    );
  });

  it("says the same after a forced swap", () => {
    registerDrumRackWithDrumSamplerOnC1();
    registerSimplerThatLoadsNothing();

    expect(writeSample("t0/d0", "pC1/sample", MISSING, true)).toStrictEqual(
      failed("pC1/sample", `${NOTHING_READ}; ${LEFT_SIMPLER}`),
    );
  });

  it("says it left an empty chain when no Simpler could be made", () => {
    registerUnbuiltPadChain();
    registerChainInsertingNothing();

    expect(
      updateDevice({
        path: "t0/d0",
        params: [{ name: "pC1/sample", value: KICK }],
      }),
    ).toStrictEqual({
      id: "drum-rack",
      path: "t0/d0",
      params: failed(
        "pC1/sample",
        `${NO_SIMPLER}; left an empty chain on pad t0/d0/pC1`,
      ),
    });
  });

  // Reaching c2 on an empty pad makes c0 and c1 as well.
  it("counts every chain it made on the way to the one it wrote", () => {
    registerUnbuiltPadChain(3);
    registerChainInsertingNothing(2);

    expect(writeSample("t0/d0", "pC1/c2/sample", KICK)).toStrictEqual(
      failed(
        "pC1/c2/sample",
        `${NO_SIMPLER}; left 3 empty chains on pad t0/d0/pC1`,
      ),
    );
  });

  it("names the Simpler and the other chains it made", () => {
    registerUnbuiltPadChain(2);
    registerSimplerThatLoadsNothing(1);

    expect(writeSample("t0/d0", "pC1/c1/sample", MISSING)).toStrictEqual(
      failed(
        "pC1/c1/sample",
        `${NOTHING_READ}; left an empty Simpler and an empty chain on pad t0/d0/pC1`,
      ),
    );
  });
});

describe("updateDevice - what a failed pad sample write left, by the pad", () => {
  it("says it left an empty Simpler when the path was refused", () => {
    registerPadRack();
    registerCreatedSimpler();

    expect(writeSample("t0/d0/pC1", "sample", "kick.wav")).toStrictEqual(
      failed(
        "sample",
        `'sample' must be an absolute file path (got "kick.wav"); ${LEFT_SIMPLER}`,
      ),
    );
  });

  it("says it left an empty Simpler when no file was found", () => {
    registerPadRack();
    registerSimplerThatLoadsNothing();

    expect(writeSample("t0/d0/pC1", "sample", MISSING)).toStrictEqual(
      failed("sample", `${NOTHING_READ}; ${LEFT_SIMPLER}`),
    );
  });

  it("says the same after a forced swap", () => {
    const [chain] = registerPadRack();

    registerDrumSamplerOn(chain as RegisteredMockObject);
    registerSimplerThatLoadsNothing();

    expect(writeSample("t0/d0/pC1", "sample", MISSING, true)).toStrictEqual(
      failed("sample", `${NOTHING_READ}; ${LEFT_SIMPLER}`),
    );
  });

  it("says nothing was left when the Simpler was already there", () => {
    const [chain] = registerPadRack();

    (chain as RegisteredMockObject).properties.devices =
      children("new-simpler");
    registerSimplerThatLoadsNothing();

    expect(
      noParamLanded(() =>
        updateDevice({
          path: "t0/d0/pC1",
          params: [{ name: "sample", value: MISSING }],
        }),
      ),
    ).toBe(`no param landed — "sample": ${NOTHING_READ}`);
  });

  it("says it left an empty Simpler on a chain it made", () => {
    registerUnbuiltPadChain();
    registerSimplerThatLoadsNothing();

    expect(writeSample("t0/d0/pC1", "sample", MISSING)).toStrictEqual(
      failed("sample", `${NOTHING_READ}; ${LEFT_SIMPLER}`),
    );
  });

  // The chain was made for the sample, so the call changed the Set: no throw.
  it("says it left an empty chain when no Simpler could be made", () => {
    registerUnbuiltPadChain();
    registerChainInsertingNothing();

    expect(
      updateDevice({
        path: "t0/d0/pC1",
        params: [{ name: "sample", value: KICK }],
      }),
    ).toStrictEqual({
      id: "pad-36",
      path: "t0/d0/pC1",
      params: failed(
        "sample",
        `${NO_SIMPLER}; left an empty chain on pad t0/d0/pC1`,
      ),
    });
  });
});
