// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateDevice } from "../update-device.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateDevice - Chain and DrumPad support", () => {
  let chain: RegisteredMockObject;
  let drumChain: RegisteredMockObject;
  let drumPad: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("123", { type: "RackDevice" });
    chain = registerMockObject("456", { type: "Chain" });
    drumChain = registerMockObject("789", { type: "DrumChain" });
    drumPad = registerMockObject("790", { type: "DrumPad" });
    registerMockObject("791", { type: "Track" });
  });

  describe("mute and solo", () => {
    it("should set mute on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        mute: true,
      });

      expect(chain.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set solo on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        solo: true,
      });

      expect(chain.set).toHaveBeenCalledWith("solo", 1);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set mute on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        mute: true,
      });

      expect(drumChain.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should set mute on a DrumPad", () => {
      const result = updateDevice({
        ids: "790",
        mute: true,
      });

      expect(drumPad.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "790" });
    });

    it("should set mute to false (unmute)", () => {
      const result = updateDevice({
        ids: "456",
        mute: false,
      });

      expect(chain.set).toHaveBeenCalledWith("mute", 0);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should warn when mute is used on a Device", () => {
      const result = updateDevice({
        ids: "123",
        mute: true,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'mute' not applicable to RackDevice",
      );
      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("color", () => {
    it("should set color on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        color: "#3B82F6",
      });

      // setColor converts #3B82F6 to (0x3B << 16) | (0x82 << 8) | 0xF6 = 3900150
      expect(chain.set).toHaveBeenCalledWith("color", 3900150);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set color on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        color: "#FF0000",
      });

      // setColor converts #FF0000 to (0xFF << 16) | (0x00 << 8) | 0x00 = 16711680
      expect(drumChain.set).toHaveBeenCalledWith("color", 16711680);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when color is used on a DrumPad", () => {
      const result = updateDevice({
        ids: "790",
        color: "#FF0000",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'color' not applicable to DrumPad",
      );
      expect(result).toStrictEqual({ id: "790" });
    });

    it("should warn when color is used on a Device", () => {
      const result = updateDevice({
        ids: "123",
        color: "#FF0000",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'color' not applicable to RackDevice",
      );
      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("chokeGroup (DrumChain only)", () => {
    it("should set chokeGroup on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        chokeGroup: 1,
      });

      expect(drumChain.set).toHaveBeenCalledWith("choke_group", 1);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when chokeGroup is used on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        chokeGroup: 1,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'chokeGroup' not applicable to Chain",
      );
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should warn when chokeGroup is used on a Device", () => {
      const result = updateDevice({
        ids: "123",
        chokeGroup: 1,
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'chokeGroup' not applicable to RackDevice",
      );
      expect(result).toStrictEqual({ id: "123" });
    });
  });

  describe("mappedPitch (DrumChain only)", () => {
    it("should set mappedPitch on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        mappedPitch: "C3",
      });

      expect(drumChain.set).toHaveBeenCalledWith("out_note", 60);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should handle sharp notes for mappedPitch", () => {
      updateDevice({
        ids: "789",
        mappedPitch: "F#2",
      });

      expect(drumChain.set).toHaveBeenCalledWith("out_note", 54);
    });

    it("should warn for invalid note name in mappedPitch", () => {
      const result = updateDevice({
        ids: "789",
        mappedPitch: "InvalidNote",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        'updateDevice: invalid note name "InvalidNote"',
      );
      expect(drumChain.set).not.toHaveBeenCalledWith(
        "out_note",
        expect.anything(),
      );
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when mappedPitch is used on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        mappedPitch: "C3",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'mappedPitch' not applicable to Chain",
      );
      expect(result).toStrictEqual({ id: "456" });
    });
  });

  describe("device-only properties on non-devices", () => {
    // collapsed — kept for potential future use (test removed)

    it("should warn when params is used on a DrumPad", () => {
      const result = updateDevice({
        ids: "790",
        params: [{ name: "789", value: "0.5" }],
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'params' not applicable to DrumPad",
      );
      expect(result).toStrictEqual({ id: "790" });
    });

    it("should not warn when params is an empty array on a DrumPad", () => {
      const result = updateDevice({ ids: "790", params: [] });

      expect(outlet).not.toHaveBeenCalledWith(
        1,
        "updateDevice: 'params' not applicable to DrumPad",
      );
      expect(result).toStrictEqual({ id: "790" });
    });
  });

  describe("cross-type not-applicable warnings", () => {
    beforeEach(() => {
      // A non-rack device (rack-only props don't apply) and a rack device.
      registerMockObject("800", { type: "PluginDevice" });
      registerMockObject("801", {
        type: "RackDevice",
        properties: { can_have_chains: 1, visible_macro_count: 4 },
      });
    });

    it.each([
      ["macroVariation", { macroVariation: "create" }, "PluginDevice", "800"],
      [
        "macroVariationIndex",
        { macroVariationIndex: 1 },
        "PluginDevice",
        "800",
      ],
      ["solo", { solo: true }, "RackDevice", "123"],
      ["mappedPitch", { mappedPitch: "C3" }, "RackDevice", "123"],
    ] as const)(
      "warns that %s is not applicable to a device",
      (label, args, type, id) => {
        updateDevice({ ids: id, ...args });

        expect(outlet).toHaveBeenCalledWith(
          1,
          `updateDevice: '${label}' not applicable to ${type}`,
        );
      },
    );

    it.each([
      ["macroVariation", { macroVariation: "create" }],
      ["macroVariationIndex", { macroVariationIndex: 1 }],
      ["macroCount", { macroCount: 4 }],
      ["abCompare", { abCompare: "a" }],
    ] as const)("warns that %s is not applicable to a Chain", (label, args) => {
      updateDevice({ ids: "456", ...args });

      expect(outlet).toHaveBeenCalledWith(
        1,
        `updateDevice: '${label}' not applicable to Chain`,
      );
    });

    it("does not spuriously warn about A/B Compare when abCompare is unset", () => {
      updateDevice({ ids: "123", mute: true });

      expect(outlet).not.toHaveBeenCalledWith(
        1,
        "updateDevice: A/B Compare not available on this device",
      );
    });

    it("does not spuriously adjust macro count on a rack when macroCount is unset", () => {
      updateDevice({ ids: "801", abCompare: "a" });

      expect(outlet).not.toHaveBeenCalledWith(
        1,
        expect.stringContaining("macro count rounded"),
      );
    });
  });

  describe("unset property guards", () => {
    it("does not touch mute/solo on a Chain when only color is set", () => {
      updateDevice({ ids: "456", color: "#FF0000" });

      expect(chain.set).not.toHaveBeenCalledWith("mute", expect.anything());
      expect(chain.set).not.toHaveBeenCalledWith("solo", expect.anything());
      // Unset (null) params must be treated as absent, not warned about.
      expect(outlet).not.toHaveBeenCalledWith(
        1,
        expect.stringContaining("not applicable"),
      );
    });

    it("does not touch chokeGroup/mappedPitch on a DrumChain when only mute is set", () => {
      updateDevice({ ids: "789", mute: true });

      expect(drumChain.set).not.toHaveBeenCalledWith(
        "choke_group",
        expect.anything(),
      );
      expect(drumChain.set).not.toHaveBeenCalledWith(
        "out_note",
        expect.anything(),
      );
      expect(outlet).not.toHaveBeenCalledWith(
        1,
        expect.stringContaining("invalid note name"),
      );
    });
  });

  describe("invalid types", () => {
    it("should warn and skip for Track type", () => {
      // Should not throw, just warn and return empty array (no valid targets)
      const result = updateDevice({
        ids: "791",
        name: "Test",
      });

      expect(result).toStrictEqual([]);
    });
  });

  describe("name on all types", () => {
    it("should set name on a Chain", () => {
      const result = updateDevice({
        ids: "456",
        name: "My Chain",
      });

      expect(chain.set).toHaveBeenCalledWith("name", "My Chain");
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set name on a DrumChain", () => {
      const result = updateDevice({
        ids: "789",
        name: "Kick",
      });

      expect(drumChain.set).toHaveBeenCalledWith("name", "Kick");
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should warn when name is used on a DrumPad (read-only)", () => {
      const result = updateDevice({
        ids: "790",
        name: "Hi-Hat",
      });

      expect(outlet).toHaveBeenCalledWith(
        1,
        "updateDevice: 'name' is read-only for DrumPad",
      );
      expect(drumPad.set).not.toHaveBeenCalledWith("name", expect.anything());
      expect(result).toStrictEqual({ id: "790" });
    });
  });
});

describe("updateDevice - chain mixer (gainDb, pan, sends)", () => {
  const rackPath = livePath.track(0).device(0);
  const chainPath = rackPath.chain(0);
  const mixerPath = `${chainPath} mixer_device`;
  let volume: RegisteredMockObject;
  let panning: RegisteredMockObject;
  let send: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("chain-0", { path: chainPath, type: "DrumChain" });
    registerMockObject("mixer-0", {
      path: mixerPath,
      properties: { sends: children("send-0") },
    });
    send = registerMockObject("send-0");
    registerMockObject("rack-0", {
      path: rackPath,
      properties: { return_chains: children("rc-0") },
    });
    registerMockObject("rc-0", { properties: { name: "a Reverb" } });
    volume = registerMockObject("volume-0", {
      path: `${mixerPath} volume`,
      properties: { display_value: 0 },
    });
    panning = registerMockObject("panning-0", {
      path: `${mixerPath} panning`,
      properties: { value: 0 },
    });
  });

  it("sets a chain's own gain and pan", () => {
    const result = updateDevice({ ids: "chain-0", gainDb: -15, pan: -0.3 });

    expect(volume.set).toHaveBeenCalledWith("display_value", -15);
    expect(panning.set).toHaveBeenCalledWith("value", -0.3);
    expect(result).toStrictEqual({ id: "chain-0" });
  });

  it("sets a chain's send to a rack return chain", () => {
    updateDevice({ ids: "chain-0", sendGainDb: -12, sendReturn: "a" });

    expect(send.set).toHaveBeenCalledWith("display_value", -12);
    expect(volume.set).not.toHaveBeenCalled();
  });

  it("does not touch the mixer when nothing mixer-related is given", () => {
    updateDevice({ ids: "chain-0", mute: true });

    expect(volume.set).not.toHaveBeenCalled();
    expect(panning.set).not.toHaveBeenCalled();
    expect(send.set).not.toHaveBeenCalled();
  });

  // pan and sendReturn each need their own case: paired with another mixer
  // param they ride along on the other one's gate check.
  it("sets pan when it is the only mixer param given", () => {
    updateDevice({ ids: "chain-0", pan: 0.5 });

    expect(panning.set).toHaveBeenCalledWith("value", 0.5);
  });

  it("warns when sendReturn is the only mixer param given", () => {
    updateDevice({ ids: "chain-0", sendReturn: "a" });

    expect(send.set).not.toHaveBeenCalled();
    expect(outlet).toHaveBeenCalledWith(
      1,
      "sendGainDb and sendReturn must both be specified",
    );
  });

  it.each(["DrumPad", "SimplerDevice"] as const)(
    "warns when mixer params are used on a %s",
    (type) => {
      registerMockObject("target-1", { type });

      updateDevice({
        ids: "target-1",
        gainDb: -3,
        pan: 1,
        sendGainDb: -6,
        sendReturn: "a",
      });

      for (const name of ["gainDb", "pan", "sendGainDb", "sendReturn"]) {
        expect(outlet).toHaveBeenCalledWith(
          1,
          `updateDevice: '${name}' not applicable to ${type}`,
        );
      }
    },
  );
});

describe("updateDevice - moving a device out of a trimmed chain", () => {
  const rackPath = livePath.track(0).device(0);
  const sourceChainPath = rackPath.chain(0);
  const sourceMixerPath = `${sourceChainPath} mixer_device`;

  beforeEach(() => {
    registerMockObject("live-set", { path: livePath.liveSet });
    registerMockObject("rack", {
      path: rackPath,
      properties: {
        chains: children("chain-0", "chain-1"),
        can_have_drum_pads: 0,
      },
    });
    registerMockObject("chain-0", {
      path: sourceChainPath,
      type: "Chain",
      properties: { name: "Trimmed" },
    });
    registerMockObject("chain-1", { path: rackPath.chain(1), type: "Chain" });
    registerMockObject("mixer-0", { path: sourceMixerPath });
    registerMockObject("volume-0", {
      path: `${sourceMixerPath} volume`,
      properties: { display_value: -15 },
    });
    registerMockObject("panning-0", {
      path: `${sourceMixerPath} panning`,
      properties: { value: 0 },
    });
    registerMockObject("device-0", {
      path: sourceChainPath.device(0),
      type: "SimplerDevice",
    });
  });

  it("carries the trim onto an untouched destination chain", () => {
    // chain-1 holds no devices and sits at defaults, so writing its fader
    // re-levels nothing — the trim follows the sound instead of stranding.
    const destinationVolume = registerMockObject("volume-1", {
      path: `${rackPath.chain(1)} mixer_device volume`,
    });

    registerMockObject("mixer-1", {
      path: `${rackPath.chain(1)} mixer_device`,
    });

    updateDevice({ ids: "device-0", toPath: "t0/d0/c1" });

    expect(destinationVolume.set).toHaveBeenCalledWith("display_value", -15);
    // Announced, because the caller asked to move a device, not to set a fader.
    expect(outlet).toHaveBeenCalledWith(
      1,
      'chain "Trimmed" trim (gainDb -15) carried onto the destination chain, which was empty and at defaults',
    );
    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("stays behind"),
    );
  });

  it("warns instead of overwriting a destination chain that holds devices", () => {
    // Its fader belongs to the devices already there; writing it would change
    // how they sound, which the caller never asked for.
    registerMockObject("chain-1", {
      path: rackPath.chain(1),
      type: "Chain",
      properties: { devices: children("resident-device") },
    });
    registerMockObject("resident-device", {
      path: rackPath.chain(1).device(0),
      type: "SimplerDevice",
    });

    updateDevice({ ids: "device-0", toPath: "t0/d0/c1" });

    expect(outlet).toHaveBeenCalledWith(
      1,
      'chain "Trimmed" trim (gainDb -15) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn',
    );
  });

  it("warns instead of overwriting a destination chain with its own trim", () => {
    registerMockObject("mixer-1", {
      path: `${rackPath.chain(1)} mixer_device`,
    });
    registerMockObject("volume-1", {
      path: `${rackPath.chain(1)} mixer_device volume`,
      properties: { display_value: 6 },
    });

    updateDevice({ ids: "device-0", toPath: "t0/d0/c1" });

    expect(outlet).toHaveBeenCalledWith(
      1,
      expect.stringContaining("stays behind"),
    );
  });

  it("stays quiet when the device only moves within its own chain", () => {
    updateDevice({ ids: "device-0", toPath: "t0/d0/c0/d1" });

    expect(outlet).not.toHaveBeenCalledWith(
      1,
      expect.stringContaining("stays behind"),
    );
  });
});
