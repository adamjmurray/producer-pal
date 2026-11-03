// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  type RegisteredMockObject,
  automatedParam,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "../../update-device.ts";
import {
  NOT_OVERRIDING_CASES,
  OVERRIDDEN,
} from "#src/tools/shared/arrangement/tracks/tests/automation-override-test-helpers.ts";
import { registerChainMixer } from "./chain-mixer-test-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateDevice - chain mixer with arrangement automation", () => {
  let chain: RegisteredMockObject;
  let volume: RegisteredMockObject;
  let panning: RegisteredMockObject;
  let activator: RegisteredMockObject;
  let send: RegisteredMockObject;

  beforeEach(() => {
    ({ chain, volume, panning, activator, send } = registerChainMixer("Chain"));
  });

  it("says so for gain and pan on the chain's entry", () => {
    automatedParam(volume, 1, true);
    automatedParam(panning);

    expect(updateDevice({ id: "chain-0", gainDb: -6, pan: 0.5 })).toStrictEqual(
      {
        id: "chain-0",
        path: "t0/d0/c0",
        detail: `gainDb: ${OVERRIDDEN}; pan: ${OVERRIDDEN}`,
      },
    );
  });

  it("says so on the send's own entry, once when it is named twice", () => {
    automatedParam(send, 1, true);

    const result = updateDevice({
      id: "chain-0",
      sends: [
        { return: "a", gainDb: -12 },
        { return: "a", gainDb: -6 },
      ],
    }) as { sends: Array<{ detail?: string }> };

    expect(result.sends.map((entry) => entry.detail)).toStrictEqual([
      expect.stringContaining("named again"),
      OVERRIDDEN,
    ]);
  });

  it("says so for mute, which drives the chain activator", () => {
    automatedParam(activator, 1, true, chain);

    expect(updateDevice({ id: "chain-0", mute: true })).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/c0",
      detail: `mute: ${OVERRIDDEN}`,
    });
  });

  it("checks an unmute the same way", () => {
    automatedParam(activator, 1, true, chain);

    expect(updateDevice({ id: "chain-0", mute: false })).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/c0",
      detail: `mute: ${OVERRIDDEN}`,
    });
    expect(chain.set).toHaveBeenCalledWith("mute", 0);
  });

  it("gives each chain its own note", () => {
    const rack2 = livePath.track(0).device(0).chain(1);

    registerMockObject("chain-1", { path: rack2, type: "Chain" });
    registerMockObject("mixer-1", { path: `${rack2} mixer_device` });

    const volume2 = registerMockObject("volume-1", {
      path: `${rack2} mixer_device volume`,
      properties: { display_value: 0 },
    });

    automatedParam(volume, 1, true);
    automatedParam(volume2, 2, true);

    expect(updateDevice({ id: "chain-0,chain-1", gainDb: -6 })).toStrictEqual([
      { id: "chain-0", path: "t0/d0/c0", detail: `gainDb: ${OVERRIDDEN}` },
      { id: "chain-1", path: "t0/d0/c1" },
    ]);
  });

  it.each(NOT_OVERRIDING_CASES)("says nothing for %s", (_, state, changes) => {
    automatedParam(volume, state, changes);
    automatedParam(send, state, changes);
    automatedParam(activator, state, changes, chain);

    const result = updateDevice({
      id: "chain-0",
      gainDb: -6,
      mute: true,
      sends: [{ return: "a", gainDb: -6 }],
    });

    expect(result).toStrictEqual({ id: "chain-0", path: "t0/d0/c0" });
  });
});
