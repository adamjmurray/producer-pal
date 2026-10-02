// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A chain or pad mixer write Live has disabled (a rack macro owns it) did
// nothing, so it is refused on the entry: ok:false when it was all the call
// asked of that target, a throw when that target was the only one, and a
// detail beside whatever else landed.

import { describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  keepsParamValue,
  livePath,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

const DISABLED = "is disabled and was not changed";
const GAIN_DISABLED = `gainDb ${DISABLED}`;

interface ChainMocks {
  volume: RegisteredMockObject;
  panning: RegisteredMockObject;
  sends: RegisteredMockObject[];
}

/**
 * Register a drum rack on t0/d0 with a C1 pad per chain, each chain's mixer
 * holding two sends to the rack's two return chains.
 * @param disabled - Mixer params a rack macro owns on chain 0
 * @returns Chain 0's mixer params
 */
function registerRack(disabled: string[] = []): ChainMocks {
  const rackPath = livePath.track(0).device(0);

  registerMockObject("rack-0", {
    path: rackPath,
    type: "RackDevice",
    properties: {
      can_have_drum_pads: 1,
      chains: children("chain-0", "chain-1"),
      drum_pads: children("pad-36"),
      return_chains: children("rc-0", "rc-1"),
    },
  });
  registerMockObject("pad-36", { type: "DrumPad", properties: { note: 36 } });
  registerMockObject("rc-0", { properties: { name: "a Delay" } });
  registerMockObject("rc-1", { properties: { name: "b Reverb" } });

  const mocks = [0, 1].map((index) => {
    const chainPath = rackPath.chain(index);
    const mixerPath = `${chainPath} mixer_device`;
    const enabled = (param: string): number =>
      index === 0 && disabled.includes(param) ? 0 : 1;

    registerMockObject(`chain-${index}`, {
      path: chainPath,
      type: "DrumChain",
      properties: { in_note: 36 + index },
    });
    registerMockObject(`mixer-${index}`, {
      path: mixerPath,
      properties: {
        sends: children(`send-${index}-0`, `send-${index}-1`),
      },
    });

    return {
      volume: registerMockObject(`volume-${index}`, {
        path: `${mixerPath} volume`,
        properties: { display_value: 0, is_enabled: enabled("volume") },
      }),
      panning: registerMockObject(`panning-${index}`, {
        path: `${mixerPath} panning`,
        properties: { value: 0, is_enabled: enabled("panning") },
      }),
      sends: [0, 1].map((send) =>
        registerMockObject(`send-${index}-${send}`, {
          properties: { is_enabled: enabled(`send${send}`) },
        }),
      ),
    };
  });

  return mocks[0] as ChainMocks;
}

describe("updateDevice - chain mixer writes Live has disabled", () => {
  it("throws for a lone chain gain Live has disabled", () => {
    const { volume } = registerRack(["volume"]);

    expect(() => updateDevice({ id: "chain-0", gainDb: -6 })).toThrow(
      GAIN_DISABLED,
    );
    expect(volume.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("throws naming both when gain and pan are disabled", () => {
    registerRack(["volume", "panning"]);

    expect(() => updateDevice({ id: "chain-0", gainDb: -6, pan: 0.5 })).toThrow(
      `${GAIN_DISABLED} — a rack macro is mapped to it. Set that macro instead, or unmap it in Live.; pan ${DISABLED}`,
    );
  });

  it("keeps the hit with a detail when the pan landed", () => {
    const { panning } = registerRack(["volume"]);

    keepsParamValue(panning, 0.5);

    expect(updateDevice({ id: "chain-0", gainDb: -6, pan: 0.5 })).toStrictEqual(
      {
        id: "chain-0",
        path: "t0/d0/pC1/c0",
        detail: expect.stringContaining(GAIN_DISABLED),
      },
    );
    expect(panning.set).toHaveBeenCalledWith("value", 0.5);
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("keeps a refused chain's slot in a multi-target call", () => {
    registerRack(["volume"]);

    expect(updateDevice({ id: "chain-0,chain-1", gainDb: -6 })).toStrictEqual([
      { id: "chain-0", ok: false, detail: expect.stringContaining(DISABLED) },
      expect.objectContaining({ id: "chain-1", path: "t0/d0/pDb1/c0" }),
    ]);
  });

  it("refuses a lone gain on a one-layer pad", () => {
    registerRack(["volume"]);

    expect(() => updateDevice({ path: "t0/d0/pC1", gainDb: -6 })).toThrow(
      GAIN_DISABLED,
    );
  });
});

describe("updateDevice - chain sends Live has disabled", () => {
  it("keeps a refused send's slot beside one that landed", () => {
    const { sends } = registerRack(["send0"]);

    keepsParamValue(sends[1] as RegisteredMockObject, -9);

    expect(
      updateDevice({
        id: "chain-0",
        sends: [
          { return: "a", gainDb: -12 },
          { return: "b", gainDb: -9 },
        ],
      }),
    ).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/pC1/c0",
      sends: [
        {
          return: "a Delay",
          returnId: "rc-0",
          ok: false,
          detail: expect.stringContaining(GAIN_DISABLED),
        },
      ],
    });
    expect(sends[0]?.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toStrictEqual([]);
  });

  it("throws naming each send when none landed", () => {
    registerRack(["send0"]);

    expect(() =>
      updateDevice({
        id: "chain-0",
        sends: [
          { return: "a", gainDb: -12 },
          { return: "zz", gainDb: -9 },
        ],
      }),
    ).toThrow(
      /^no send landed — "a Delay": gainDb is disabled .*; "zz": no return chain matching "zz"/,
    );
  });

  it("keeps the failed sends on a chain whose name landed", () => {
    registerRack(["send0"]);

    expect(
      updateDevice({
        id: "chain-0",
        name: "Kick",
        sendGainDb: -12,
        sendReturn: "a",
      }),
    ).toStrictEqual({
      id: "chain-0",
      path: "t0/d0/pC1/c0",
      sends: [
        {
          return: "a Delay",
          returnId: "rc-0",
          ok: false,
          detail: expect.stringContaining(GAIN_DISABLED),
        },
      ],
    });
  });

  it("marks the chain ok:false in a list when none of its sends landed", () => {
    registerRack(["send0"]);

    const result = updateDevice({
      id: "chain-0,chain-1",
      sendGainDb: -12,
      sendReturn: "a",
    });

    expect(result).toStrictEqual([
      {
        id: "chain-0",
        ok: false,
        detail: expect.stringMatching(/^no send landed — "a Delay": gainDb/),
      },
      expect.objectContaining({ id: "chain-1", path: "t0/d0/pDb1/c0" }),
    ]);
  });
});
