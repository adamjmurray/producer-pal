// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A send is an index into its rack's return chains, and two racks don't share
// those. Within one rack every send carries; across racks only the ones whose
// return name exists on both sides can.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath, type PathLike } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

vi.mock(
  import("#src/tools/shared/device/helpers/chain-mixer-helpers.ts"),
  async (importOriginal) => ({
    ...(await importOriginal()),
    applyChainMixer: vi.fn(() => ({})),
  }),
);

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

import { copyChainMixerTo } from "#src/tools/actions/duplicate/helpers/device/duplicate-chain-mixer-helpers.ts";
import { applyChainMixer } from "#src/tools/shared/device/helpers/chain-mixer-helpers.ts";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";

const SOURCE_RACK = livePath.track(0).device(0);
const OTHER_RACK = livePath.track(1).device(0);

/**
 * Register a rack with the named return chains.
 * @param id - Mock id for the rack
 * @param path - The rack's Live API path
 * @param returnNames - Return chain names, in send order
 * @returns The rack mock
 */
function rackWithReturns(id: string, path: PathLike, returnNames: string[]) {
  const returnIds = returnNames.map((_, i) => `${id}-rc-${i}`);

  for (const [i, name] of returnNames.entries()) {
    registerMockObject(returnIds[i] as string, {
      type: "Chain",
      properties: { name },
    });
  }

  registerMockObject(id, {
    path,
    type: "RackDevice",
    properties: { return_chains: children(...returnIds) },
  });

  // The helper takes live objects, not the registration handles.
  return LiveAPI.from(id);
}

/**
 * Copy a mixer onto a freshly registered destination chain.
 * @param mixer - readChainMixer output from the source chain
 * @param source - The rack the source chain belongs to
 * @param destination - The rack the copy landed in
 * @returns The new chain the mixer was written to
 */
function copyMixerToNewChain(
  mixer: Record<string, unknown>,
  source: LiveAPI,
  destination: LiveAPI,
) {
  registerMockObject("chain-new", { type: "Chain" });

  const created = LiveAPI.from("chain-new");

  copyChainMixerTo(created, mixer, source, destination);

  return created;
}

describe("copyChainMixerTo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("carries gain and pan", () => {
    const rack = rackWithReturns("rack-0", SOURCE_RACK, []);

    const created = copyMixerToNewChain({ gainDb: -6, pan: 0.4 }, rack, rack);

    expect(applyChainMixer).toHaveBeenCalledWith(created, {
      gainDb: -6,
      pan: 0.4,
    });
  });

  it("carries every send when the copy stays in the same rack", () => {
    const rack = rackWithReturns("rack-0", SOURCE_RACK, ["a Verb"]);

    const created = copyMixerToNewChain(
      { sends: [{ return: "a Verb", gainDb: -9 }] },
      rack,
      rack,
    );

    expect(applyChainMixer).toHaveBeenCalledWith(created, {
      gainDb: undefined,
      pan: undefined,
      sends: [{ return: "a Verb", gainDb: -9 }],
    });
  });

  it("carries a cross-rack send whose return name exists on both sides", () => {
    const source = rackWithReturns("rack-0", SOURCE_RACK, ["a Verb"]);
    const destination = rackWithReturns("rack-1", OTHER_RACK, ["A VERB"]);

    const created = copyMixerToNewChain(
      { sends: [{ return: "a Verb", gainDb: -9 }] },
      source,
      destination,
    );

    expect(applyChainMixer).toHaveBeenCalledWith(created, {
      gainDb: undefined,
      pan: undefined,
      sends: [{ return: "a Verb", gainDb: -9 }],
    });
  });

  it("drops a cross-rack send with no match, naming it", () => {
    const source = rackWithReturns("rack-0", SOURCE_RACK, ["a Verb"]);
    const destination = rackWithReturns("rack-1", OTHER_RACK, ["b Delay"]);

    const created = copyMixerToNewChain(
      { sends: [{ return: "a Verb", gainDb: -9 }] },
      source,
      destination,
    );

    expect(applyChainMixer).toHaveBeenCalledWith(created, {
      gainDb: undefined,
      pan: undefined,
    });
    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      'no return chain named "a Verb", so that send was not copied',
    );
  });

  it("pluralizes the warning when several sends are dropped", () => {
    const source = rackWithReturns("rack-0", SOURCE_RACK, ["a Verb", "b Del"]);
    const destination = rackWithReturns("rack-1", OTHER_RACK, []);

    copyMixerToNewChain(
      {
        sends: [
          { return: "a Verb", gainDb: -9 },
          { return: "b Del", gainDb: -3 },
        ],
      },
      source,
      destination,
    );

    expect(vi.mocked(consoleMock.warn).mock.calls.join()).toContain(
      "those sends were not copied",
    );
  });
});
