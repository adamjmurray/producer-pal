// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Budget test for a batch chain update.
//
// Retrimming or renaming every chain of a rack in one call is ordinary work.
// Resolving a device path is pure string building, so the track and the rack
// above the target are never built at all — only the chain is.
//
// These count resolutions rather than asserting output. What they are for is
// catching a NEW repeat: a count that climbs means something started resolving
// per target that used to resolve once.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolves } from "#src/live-api-adapter/tests/objects/build-budget-resolves.ts";
import {
  beginLiveApiScope,
  endLiveApiScope,
} from "#src/live-api-adapter/live-api-release.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { updateDevice } from "#src/tools/device/update/update-device.ts";
import {
  registerChainRack,
  registerDrumKit,
} from "#src/tools/device/tests/helpers/device-rack-fixtures.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  warn: vi.fn(),
  warnOnce: vi.fn(),
}));

const CHAINS = 4;

/** A track holding one plain rack of CHAINS named chains. */
function setupRack(): void {
  registerChainRack({
    trackIndex: 0,
    rackId: "rack",
    chainIds: Array.from({ length: CHAINS }, (_, i) => `chain${String(i)}`),
    chainOptions: (i) => ({
      type: "Chain",
      properties: { devices: children(), name: `Chain ${String(i)}` },
    }),
  });
}

/**
 * Rename every chain of the rack in one call.
 * @param count - How many chains to name
 */
function renameChains(count: number): void {
  updateDevice({
    path: Array.from({ length: count }, (_, i) => `t0/d0/c${String(i)}`).join(
      ",",
    ),
    name: "Renamed",
  });
}

describe("update-device build budget", () => {
  beforeEach(setupRack);

  // Two builds per chain named, and nothing else built at all.
  //
  // One is the target itself. The other is the drum-chain spelling check: this
  // tool opens no withDevicePathCache scope, so the object that check builds is
  // not the one the write then uses. That second build is the price of teaching
  // the pad spelling, taken deliberately — it was 1 per chain before the check
  // existed. The way to get it back is to share one resolution between the
  // check and the write, the way navigateToChain does.
  it("builds the target twice per chain and its ancestors never", () => {
    renameChains(CHAINS);

    expect(resolves("live_set tracks * devices * chains *")).toBe(CHAINS * 2);

    // A device path resolves by string building, so nothing above the target
    // is ever built — not once, let alone once per path in the batch.
    expect(resolves("live_set tracks *")).toBe(0);
    expect(resolves("live_set tracks * devices *")).toBe(0);
  });

  it("stays linear in the batch, with no per-target term that grows", () => {
    renameChains(1);

    expect(resolves("live_set tracks * devices * chains *")).toBe(2);
  });
});

const PAD_NOTES = ["C1", "D1", "E1", "F1"];

/** A track holding a Drum Rack whose pads each carry one chain. */
function setupKit(): void {
  registerDrumKit({
    trackIndex: 1,
    kitId: "kit",
    padIdPrefix: "pad",
    chainIds: PAD_NOTES.map((_, i) => `kitchain${String(i)}`),
    chainOptions: () => ({ type: "DrumChain" }),
  });
}

describe("update-device drum spelling budget", () => {
  beforeEach(setupKit);

  // The taught spelling is not the cheap one, and pretending otherwise would
  // hide the trade. A pad path stops the walk at the pad segment and resolves
  // the rest against the live rack: finding which chains sit on a pad means
  // reading in_note off every chain in the rack, so the cost is the rack's
  // size, not the pad's. Rack-relative addressing builds one object instead.
  //
  // Pad spelling is what results teach because it keeps naming the same chain
  // once a pad is layered. That is a correctness argument, not a speed one.
  // These numbers are a baseline to ratchet down.
  //
  // Wrapped in a request scope so the rack's chain scan memoizes across the
  // three passes below — without a scope open, requestMemo recomputes every
  // call, same as production outside a request.
  it("costs a rack chain scan to address a pad's layer", () => {
    beginLiveApiScope();

    try {
      updateDevice({ path: "t1/d0/pC1/c0", name: "Kick" });
    } finally {
      endLiveApiScope();
    }

    // The rack has PAD_NOTES.length chains, scanned once for the whole
    // request rather than once per pass.
    expect(resolves("id kitchain*")).toBe(PAD_NOTES.length);
    expect(resolves("live_set tracks * devices *")).toBe(3);

    // Never by path: a pad's layers are found among the rack's chains, so the
    // cN spelling — and its spelling check — is never reached.
    expect(resolves("live_set tracks * devices * chains *")).toBe(0);
  });
});
