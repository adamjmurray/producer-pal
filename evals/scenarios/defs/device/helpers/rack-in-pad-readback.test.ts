// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type LayerSpec,
  assertPadChains,
  assertRackLayers,
  describeLayers,
  holdsInstrument,
  isLayerUntouched,
  layersAreUntouched,
  rackChains,
} from "./rack-in-pad-readback.ts";

const TOP: LayerSpec = { name: "Top", device: "Operator", gainDb: -2 };
const SUB: LayerSpec = { name: "Sub", device: "Drift", gainDb: -4 };

const topChain = {
  name: "Top",
  gainDb: -2.05,
  devices: [{ type: "instrument: Operator" }],
};
const subChain = {
  name: "Sub",
  gainDb: -4,
  devices: [{ type: "instrument: Drift" }],
};

describe("rackChains", () => {
  it("lists the chains of a read, or none", () => {
    expect(rackChains({ chains: [topChain] })).toStrictEqual([topChain]);
    expect(rackChains({})).toStrictEqual([]);
  });
});

describe("describeLayers", () => {
  it("shows each layer's instruments, level and state", () => {
    expect(
      describeLayers({
        chains: [topChain, { name: "Mute", state: "muted", devices: [] }],
      }),
    ).toBe("Top [instrument: Operator] -2.05 dB; Mute [empty] 0 dB muted");
  });

  it("says so when there are no layers", () => {
    expect(describeLayers({})).toBe("no layers");
  });
});

describe("holdsInstrument", () => {
  it("matches the instrument by name, whatever the case", () => {
    expect(holdsInstrument(topChain, "operator")).toBe(true);
    expect(holdsInstrument(topChain, "Drift")).toBe(false);
    expect(holdsInstrument({}, "Drift")).toBe(false);
  });
});

describe("isLayerUntouched", () => {
  it("accepts a layer as built, within the dB slack", () => {
    expect(isLayerUntouched(topChain, TOP)).toBe(true);
  });

  it("rejects a moved fader, a mute, another instrument, or no layer", () => {
    expect(isLayerUntouched({ ...topChain, gainDb: -8 }, TOP)).toBe(false);
    expect(isLayerUntouched({ ...topChain, state: "muted" }, TOP)).toBe(false);
    expect(isLayerUntouched(subChain, TOP)).toBe(false);
    expect(isLayerUntouched(undefined, TOP)).toBe(false);
  });

  it("reads a missing gainDb as 0 dB", () => {
    const flat: LayerSpec = { name: "Flat", device: "Drift", gainDb: 0 };

    expect(
      isLayerUntouched({ name: "Flat", devices: subChain.devices }, flat),
    ).toBe(true);
  });
});

describe("layersAreUntouched", () => {
  it("accepts the built layers in any order", () => {
    expect(
      layersAreUntouched({ chains: [subChain, topChain] }, [TOP, SUB]),
    ).toBe(true);
  });

  it("rejects an extra or a missing layer", () => {
    expect(layersAreUntouched({ chains: [topChain] }, [TOP, SUB])).toBe(false);
    expect(
      layersAreUntouched({ chains: [topChain, subChain, { name: "New" }] }, [
        TOP,
        SUB,
      ]),
    ).toBe(false);
  });
});

describe("the state assertions", () => {
  it("read the rack with its devices", () => {
    const assertion = assertRackLayers("t0/d0", "x", () => true);

    expect(assertion.type).toBe("state");
    expect(assertion.type === "state" && assertion.args).toStrictEqual({
      path: "t0/d0",
      include: ["chains"],
      maxDepth: 1,
    });
  });

  it("explain a failed rack read with the layers they found", () => {
    const assertion = assertRackLayers("t0/d0", "two layers", () => false);

    expect(
      assertion.type === "state" && assertion.explain?.({ chains: [topChain] }),
    ).toBe(
      "t0/d0: expected two layers, got Top [instrument: Operator] -2.05 dB",
    );
  });

  it("grade a pad's own chains", () => {
    const assertion = assertPadChains(
      "t0/d0/pC1",
      "one chain",
      (chains) => chains.length === 1,
    );

    expect(assertion.type === "state" && assertion.expect).toBeTypeOf(
      "function",
    );

    if (assertion.type === "state" && typeof assertion.expect === "function") {
      expect(assertion.expect({ chains: [topChain] })).toBe(true);
      expect(assertion.expect({ chains: [topChain, subChain] })).toBe(false);
      expect(assertion.explain?.({})).toBe(
        "t0/d0/pC1: expected one chain, got no layers",
      );
    }
  });
});
