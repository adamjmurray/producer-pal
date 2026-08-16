// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  applyChainMixer,
  readChainMixer,
  warnIfChainMixerLeftBehind,
} from "../chain-mixer-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

const rackPath = livePath.track(0).device(0);
const chainPath = rackPath.chain(1);
const mixerPath = `${chainPath} mixer_device`;

interface MixerMocks {
  chain: RegisteredMockObject;
  volume: RegisteredMockObject;
  panning: RegisteredMockObject;
}

/**
 * Register a chain with a mixer at track 0 / device 0 / chain 1
 * @param overrides - Mixer values (defaults are all neutral)
 * @param overrides.gainDb - Volume in dB
 * @param overrides.pan - Pan -1..1
 * @param overrides.sends - Send {value, display_value} pairs
 * @param overrides.type - Chain type
 * @returns The registered chain and its volume/panning parameters
 */
function registerChainWithMixer({
  gainDb = 0,
  pan = 0,
  sends = [],
  type = "DrumChain",
}: {
  gainDb?: number;
  pan?: number;
  sends?: { value: number; display_value: number }[];
  type?: "Chain" | "DrumChain";
} = {}): MixerMocks {
  const chain = registerMockObject("chain-1", {
    path: chainPath,
    type,
    properties: { name: "Snare" },
  });

  registerMockObject("mixer-1", {
    path: mixerPath,
    type: "ChainMixerDevice",
    properties: {
      sends: children(...sends.map((_, i) => `send-${i}`)),
    },
  });
  const volume = registerMockObject("volume-1", {
    path: `${mixerPath} volume`,
    type: "DeviceParameter",
    properties: { display_value: gainDb },
  });
  const panning = registerMockObject("panning-1", {
    path: `${mixerPath} panning`,
    type: "DeviceParameter",
    properties: { value: pan },
  });

  for (const [i, send] of sends.entries()) {
    registerMockObject(`send-${i}`, {
      type: "DeviceParameter",
      properties: send,
    });
  }

  return { chain, volume, panning };
}

/**
 * Point a fresh LiveAPI at the registered chain
 * @returns The chain object
 */
function chainApi(): LiveAPI {
  return LiveAPI.from(chainPath);
}

describe("readChainMixer", () => {
  it("returns nothing when every setting is at its default", () => {
    registerChainWithMixer();

    expect(readChainMixer(chainApi())).toStrictEqual({});
  });

  it("returns nothing when the chain has no mixer device", () => {
    mockNonExistentObjects();
    registerMockObject("chain-1", { path: chainPath, type: "Chain" });

    expect(readChainMixer(chainApi())).toStrictEqual({});
  });

  it("reports a non-zero gain and pan, rounding pan to Live's 1% steps", () => {
    registerChainWithMixer({ gainDb: -15, pan: -0.30000001192092896 });

    expect(readChainMixer(chainApi())).toStrictEqual({
      gainDb: -15,
      pan: -0.3,
    });
  });

  it("treats sub-1% pan as centered rather than reporting pan 0", () => {
    registerChainWithMixer({ pan: 0.004 });

    expect(readChainMixer(chainApi())).toStrictEqual({});
  });

  it("names active sends after the rack's return chains and skips silent ones", () => {
    registerChainWithMixer({
      sends: [
        { value: 0, display_value: -70 },
        { value: 0.6, display_value: -12 },
      ],
    });
    registerMockObject("rack-1", {
      path: rackPath,
      type: "RackDevice",
      properties: { return_chains: children("rc-0", "rc-1") },
    });
    registerMockObject("rc-0", {
      type: "Chain",
      properties: { name: "Delay" },
    });
    registerMockObject("rc-1", {
      type: "Chain",
      properties: { name: "Reverb" },
    });

    expect(readChainMixer(chainApi())).toStrictEqual({
      sends: [{ return: "Reverb", gainDb: -12 }],
    });
  });

  it("falls back to a numbered return name when the rack has none", () => {
    registerChainWithMixer({ sends: [{ value: 0.5, display_value: -14 }] });
    registerMockObject("rack-1", {
      path: rackPath,
      type: "RackDevice",
      properties: { return_chains: [] },
    });

    expect(readChainMixer(chainApi())).toStrictEqual({
      sends: [{ return: "Return 1", gainDb: -14 }],
    });
  });
});

describe("applyChainMixer", () => {
  it("sets volume in dB and pan as a raw value", () => {
    const { volume, panning } = registerChainWithMixer();

    applyChainMixer(chainApi(), { gainDb: -6, pan: 0.25 });

    expect(volume.set).toHaveBeenCalledWith("display_value", -6);
    expect(panning.set).toHaveBeenCalledWith("value", 0.25);
  });

  it("leaves the other setting alone when only one is given", () => {
    const { volume, panning } = registerChainWithMixer();

    applyChainMixer(chainApi(), { pan: -1 });

    expect(volume.set).not.toHaveBeenCalled();
    expect(panning.set).toHaveBeenCalledWith("value", -1);

    applyChainMixer(chainApi(), { gainDb: -6 });

    expect(volume.set).toHaveBeenCalledWith("display_value", -6);
    expect(panning.set).toHaveBeenCalledTimes(1);
  });

  it("warns and skips when the chain has no mixer device", () => {
    mockNonExistentObjects();
    registerMockObject("chain-1", { path: chainPath, type: "Chain" });

    applyChainMixer(chainApi(), { gainDb: -6 });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("has no mixer device"),
    );
  });

  describe("sends", () => {
    const silent = { value: 0, display_value: -70 };

    /**
     * Register the chain with two silent sends and name the rack's return chains
     * @param returnNames - Return chain names in send order
     * @returns The registered send parameters
     */
    function registerChainWithSends(
      returnNames: string[] = ["a Delay", "b Reverb"],
    ): RegisteredMockObject[] {
      registerChainWithMixer({ sends: [silent, silent] });
      registerMockObject("rack-1", {
        path: rackPath,
        type: "RackDevice",
        properties: {
          return_chains: children(...returnNames.map((_, i) => `rc-${i}`)),
        },
      });

      for (const [i, name] of returnNames.entries()) {
        registerMockObject(`rc-${i}`, {
          type: "Chain",
          properties: { name },
        });
      }

      return [
        registerMockObject("send-0", { type: "DeviceParameter" }),
        registerMockObject("send-1", { type: "DeviceParameter" }),
      ];
    }

    it("sets the send matched by exact return chain name", () => {
      const [first, second] = registerChainWithSends();

      applyChainMixer(chainApi(), { sendGainDb: -12, sendReturn: "b Reverb" });

      expect(second?.set).toHaveBeenCalledWith("display_value", -12);
      expect(first?.set).not.toHaveBeenCalled();
    });

    it("matches a return chain by its letter, ignoring case", () => {
      const [first] = registerChainWithSends();

      applyChainMixer(chainApi(), { sendGainDb: 0, sendReturn: "A" });

      expect(first?.set).toHaveBeenCalledWith("display_value", 0);
    });

    it("warns when only one of sendGainDb and sendReturn is given", () => {
      const sends = registerChainWithSends();

      applyChainMixer(chainApi(), { sendGainDb: -6 });
      applyChainMixer(chainApi(), { sendReturn: "a" });

      expect(outlet).toHaveBeenCalledTimes(2);
      expect(outlet).toHaveBeenCalledWith(
        1,
        "sendGainDb and sendReturn must both be specified",
      );
      expect(sends[0]?.set).not.toHaveBeenCalled();
    });

    it("warns with the available returns when none matches", () => {
      registerChainWithSends();

      applyChainMixer(chainApi(), { sendGainDb: -6, sendReturn: "Chorus" });

      expect(outlet).toHaveBeenCalledWith(
        1,
        'no return chain matching "Chorus" (returns: a Delay, b Reverb)',
      );
    });

    it("warns when the rack has no return chains", () => {
      registerChainWithSends([]);

      applyChainMixer(chainApi(), { sendGainDb: -6, sendReturn: "a" });

      expect(outlet).toHaveBeenCalledWith(
        1,
        'no return chain matching "a" (rack has none)',
      );
    });

    it("warns when the chain has fewer sends than the rack has returns", () => {
      registerChainWithSends(["a Delay", "b Reverb", "c Chorus"]);

      applyChainMixer(chainApi(), { sendGainDb: -6, sendReturn: "c" });

      expect(outlet).toHaveBeenCalledWith(1, "chain chain-1 has no send 2");
    });
  });
});

describe("warnIfChainMixerLeftBehind", () => {
  const devicePath = chainPath.device(0);
  let destination: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("device-1", {
      path: devicePath,
      type: "SimplerDevice",
    });
    destination = registerMockObject("dest-chain", {
      path: rackPath.chain(2),
      type: "DrumChain",
    });
  });

  it("warns with the mixer values and a pad-move hint for a drum chain", () => {
    registerChainWithMixer({ gainDb: -15 });

    warnIfChainMixerLeftBehind(
      LiveAPI.from(devicePath),
      LiveAPI.from(destination.path),
    );

    expect(outlet).toHaveBeenCalledWith(
      1,
      'chain "Snare" trim (gainDb -15) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn or move the whole pad instead (update-device with the pad path and toPath)',
    );
  });

  it("omits the pad-move hint for a regular chain", () => {
    registerChainWithMixer({ pan: 0.5, type: "Chain" });

    warnIfChainMixerLeftBehind(
      LiveAPI.from(devicePath),
      LiveAPI.from(destination.path),
    );

    expect(outlet).toHaveBeenCalledWith(
      1,
      'chain "Snare" trim (pan 0.5) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn',
    );
  });

  it("phrases a copy as a copy and drops the pad-move hint", () => {
    registerChainWithMixer({ gainDb: -15 });

    warnIfChainMixerLeftBehind(
      LiveAPI.from(devicePath),
      LiveAPI.from(destination.path),
      true,
    );

    expect(outlet).toHaveBeenCalledWith(
      1,
      'chain "Snare" trim (gainDb -15) does not follow the copy — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn',
    );
  });

  it("points at update-track when the destination is a track", () => {
    registerChainWithMixer({ gainDb: -15 });
    const track = registerMockObject("dest-track", {
      path: livePath.track(2),
      type: "Track",
    });

    warnIfChainMixerLeftBehind(
      LiveAPI.from(devicePath),
      LiveAPI.from(track.path),
    );

    expect(outlet).toHaveBeenCalledWith(
      1,
      'chain "Snare" trim (gainDb -15) stays behind — reapply on the destination track with update-track gainDb/pan/sendGainDb+sendReturn',
    );
  });

  it("counts sends rather than listing them", () => {
    registerChainWithMixer({
      gainDb: -15,
      sends: [
        { value: 0.5, display_value: -12 },
        { value: 0.5, display_value: -6 },
      ],
    });
    registerMockObject("rack-1", {
      path: rackPath,
      type: "RackDevice",
      properties: { return_chains: children("rc-0", "rc-1") },
    });
    registerMockObject("rc-0", { type: "Chain", properties: { name: "a D" } });
    registerMockObject("rc-1", { type: "Chain", properties: { name: "b R" } });

    warnIfChainMixerLeftBehind(
      LiveAPI.from(devicePath),
      LiveAPI.from(destination.path),
    );

    expect(outlet).toHaveBeenCalledWith(
      1,
      'chain "Snare" trim (gainDb -15, 2 sends) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn or move the whole pad instead (update-device with the pad path and toPath)',
    );
  });

  it("stays quiet when the chain mixer is at its defaults", () => {
    registerChainWithMixer();

    warnIfChainMixerLeftBehind(
      LiveAPI.from(devicePath),
      LiveAPI.from(destination.path),
    );

    expect(outlet).not.toHaveBeenCalled();
  });

  it("stays quiet when the device stays in the same chain", () => {
    registerChainWithMixer({ gainDb: -15 });

    warnIfChainMixerLeftBehind(LiveAPI.from(devicePath), chainApi());

    expect(outlet).not.toHaveBeenCalled();
  });

  it("stays quiet when the device is not inside a chain", () => {
    registerMockObject("track-device", {
      path: livePath.track(0).device(3),
      type: "SimplerDevice",
    });

    warnIfChainMixerLeftBehind(
      LiveAPI.from(livePath.track(0).device(3)),
      LiveAPI.from(destination.path),
    );

    expect(outlet).not.toHaveBeenCalled();
  });

  it("stays quiet when the source chain no longer exists", () => {
    mockNonExistentObjects();
    registerMockObject("device-1", {
      path: devicePath,
      type: "SimplerDevice",
    });

    warnIfChainMixerLeftBehind(
      LiveAPI.from(devicePath),
      LiveAPI.from(destination.path),
    );

    expect(outlet).not.toHaveBeenCalled();
  });
});
