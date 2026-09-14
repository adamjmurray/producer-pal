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
import { updateDevice } from "../../update-device.ts";
import { mockWorkingDeviceMoves } from "../update-device-test-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";

describe("updateDevice - Chain and DrumPad support", () => {
  let chain: RegisteredMockObject;
  let drumChain: RegisteredMockObject;
  let drumPad: RegisteredMockObject;

  beforeEach(() => {
    registerMockObject("123", { type: "RackDevice" });
    chain = registerMockObject("456", { type: "Chain" });
    drumChain = registerMockObject("789", { type: "DrumChain" });
    drumPad = registerMockObject("790", {
      // A real pad path, so the empty-pad warning can name it.
      path: livePath.track(0).device(0).drumPad(36),
      type: "DrumPad",
      properties: { note: 36 },
    });
    registerMockObject("791", { type: "Track" });
  });

  describe("mute and solo", () => {
    it("should set mute on a Chain", () => {
      const result = updateDevice({
        id: "456",
        mute: true,
      });

      expect(chain.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set solo on a Chain", () => {
      const result = updateDevice({
        id: "456",
        solo: true,
      });

      expect(chain.set).toHaveBeenCalledWith("solo", 1);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set mute on a DrumChain", () => {
      const result = updateDevice({
        id: "789",
        mute: true,
      });

      expect(drumChain.set).toHaveBeenCalledWith("mute", 1);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("refuses a lone drum pad with no chains", () => {
      // Live drops writes to an empty pad, so there is nothing to report and
      // nothing was done.
      expect(() => updateDevice({ id: "790", mute: true })).toThrow(
        "drum pad t0/d0/pC1 (id 790) has no chains, so there is " +
          "nothing to update — Live ignores writes to an empty pad",
      );
      expect(drumPad.set).not.toHaveBeenCalled();
      expect(capturedWarnings()).toStrictEqual([]);
    });

    it("should set mute to false (unmute)", () => {
      const result = updateDevice({
        id: "456",
        mute: false,
      });

      expect(chain.set).toHaveBeenCalledWith("mute", 0);
      expect(result).toStrictEqual({ id: "456" });
    });

    // Nothing else was asked, so the lone target has nothing to report and
    // throws instead (ADR-0042).
    it("should refuse mute on a Device", () => {
      expect(() => updateDevice({ id: "123", mute: true })).toThrow(
        "mute not applicable to RackDevice",
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });
  });

  describe("color", () => {
    it("should set color on a Chain", () => {
      const result = updateDevice({
        id: "456",
        color: "#3B82F6",
      });

      // setColor converts #3B82F6 to (0x3B << 16) | (0x82 << 8) | 0xF6 = 3900150
      expect(chain.set).toHaveBeenCalledWith("color", 3900150);
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set color on a DrumChain", () => {
      const result = updateDevice({
        id: "789",
        color: "#FF0000",
      });

      // setColor converts #FF0000 to (0xFF << 16) | (0x00 << 8) | 0x00 = 16711680
      expect(drumChain.set).toHaveBeenCalledWith("color", 16711680);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should refuse color on a Device", () => {
      expect(() => updateDevice({ id: "123", color: "#FF0000" })).toThrow(
        "color not applicable to RackDevice",
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });
  });

  describe("chokeGroup (DrumChain only)", () => {
    it("should set chokeGroup on a DrumChain", () => {
      const result = updateDevice({
        id: "789",
        chokeGroup: 1,
      });

      expect(drumChain.set).toHaveBeenCalledWith("choke_group", 1);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should refuse chokeGroup on a Chain", () => {
      expect(() => updateDevice({ id: "456", chokeGroup: 1 })).toThrow(
        "chokeGroup not applicable to Chain",
      );
    });

    it("should refuse chokeGroup on a Device", () => {
      expect(() => updateDevice({ id: "123", chokeGroup: 1 })).toThrow(
        "chokeGroup not applicable to RackDevice",
      );
    });
  });

  describe("mappedPitch (DrumChain only)", () => {
    it("should set mappedPitch on a DrumChain", () => {
      const result = updateDevice({
        id: "789",
        mappedPitch: "C3",
      });

      expect(drumChain.set).toHaveBeenCalledWith("out_note", 60);
      expect(result).toStrictEqual({ id: "789" });
    });

    it("should handle sharp notes for mappedPitch", () => {
      updateDevice({
        id: "789",
        mappedPitch: "F#2",
      });

      expect(drumChain.set).toHaveBeenCalledWith("out_note", 54);
    });

    // One pitch for every target in the call, so a per-target skip repeated the
    // same message. Refused before any of them is touched.
    it("should refuse an invalid note name in mappedPitch", () => {
      expect(() =>
        updateDevice({ id: "789", mappedPitch: "InvalidNote" }),
      ).toThrow('invalid note name "InvalidNote" for mappedPitch');
      expect(drumChain.set).not.toHaveBeenCalled();
    });

    it("should refuse mappedPitch on a Chain", () => {
      expect(() => updateDevice({ id: "456", mappedPitch: "C3" })).toThrow(
        "mappedPitch not applicable to Chain",
      );
    });
  });

  describe("device-only properties on non-devices", () => {
    // collapsed — kept for potential future use (test removed)

    it("refuses each param in its own entry on a Chain", () => {
      const result = updateDevice({
        id: "456",
        params: [{ name: "789", value: "0.5" }],
      });

      expect(result).toStrictEqual({
        id: "456",
        params: [
          {
            name: "789",
            ok: false,
            reason: "'params' not applicable to Chain id 456",
          },
        ],
      });
      expect(capturedWarnings()).toHaveLength(0);
    });

    it("should not warn when params is an empty array on a Chain", () => {
      const result = updateDevice({ id: "456", params: [] });

      expect(capturedWarnings()).not.toContain(
        "'params' not applicable to Chain id 456",
      );
      expect(result).toStrictEqual({ id: "456" });
    });
  });

  describe("cross-type not-applicable params", () => {
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
      "says %s is not applicable to a device, beside what did land",
      (label, args, type, id) => {
        // A name lands, so the target keeps a normal entry and the param that
        // did nothing rides on it as a reason.
        expect(updateDevice({ id, name: "Named", ...args })).toStrictEqual(
          expect.objectContaining({
            reason: `${label} not applicable to ${type}`,
          }),
        );
        expect(capturedWarnings()).toStrictEqual([]);
      },
    );

    it.each([
      ["macroVariation", { macroVariation: "create" }],
      ["macroVariationIndex", { macroVariationIndex: 1 }],
      ["macroCount", { macroCount: 4 }],
      ["abCompare", { abCompare: "a" }],
    ] as const)(
      "says %s is not applicable to a Chain, beside what did land",
      (label, args) => {
        expect(
          updateDevice({ id: "456", name: "Named", ...args }),
        ).toStrictEqual(
          expect.objectContaining({
            reason: `${label} not applicable to Chain`,
          }),
        );
        expect(capturedWarnings()).toStrictEqual([]);
      },
    );

    it("does not spuriously warn about A/B Compare when abCompare is unset", () => {
      updateDevice({ id: "123", name: "Named" });

      expect(capturedWarnings()).not.toContain(
        "A/B Compare not available on this device",
      );
    });

    it("does not spuriously adjust macro count on a rack when macroCount is unset", () => {
      updateDevice({ id: "801", abCompare: "a" });

      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("macro count rounded"),
      );
    });
  });

  describe("unset property guards", () => {
    it("does not touch mute/solo on a Chain when only color is set", () => {
      updateDevice({ id: "456", color: "#FF0000" });

      expect(chain.set).not.toHaveBeenCalledWith("mute", expect.anything());
      expect(chain.set).not.toHaveBeenCalledWith("solo", expect.anything());
      // Unset (null) params must be treated as absent, not warned about.
      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("not applicable"),
      );
    });

    it("does not touch chokeGroup/mappedPitch on a DrumChain when only mute is set", () => {
      updateDevice({ id: "789", mute: true });

      expect(drumChain.set).not.toHaveBeenCalledWith(
        "choke_group",
        expect.anything(),
      );
      expect(drumChain.set).not.toHaveBeenCalledWith(
        "out_note",
        expect.anything(),
      );
      expect(capturedWarnings()).not.toContainEqual(
        expect.stringContaining("invalid note name"),
      );
    });
  });

  describe("invalid types", () => {
    it("refuses a lone Track, which this tool can't write", () => {
      expect(() => updateDevice({ id: "791", name: "Test" })).toThrow(
        "cannot update Track objects: id 791",
      );
      expect(capturedWarnings()).toStrictEqual([]);
    });
  });

  describe("name on all types", () => {
    it("should set name on a Chain", () => {
      const result = updateDevice({
        id: "456",
        name: "My Chain",
      });

      expect(chain.set).toHaveBeenCalledWith("name", "My Chain");
      expect(result).toStrictEqual({ id: "456" });
    });

    it("should set name on a DrumChain", () => {
      const result = updateDevice({
        id: "789",
        name: "Kick",
      });

      expect(drumChain.set).toHaveBeenCalledWith("name", "Kick");
      expect(result).toStrictEqual({ id: "789" });
    });
  });
});

describe("updateDevice - moving a device out of a trimmed chain", () => {
  const rackPath = livePath.track(0).device(0);
  const sourceChainPath = rackPath.chain(0);
  const sourceMixerPath = `${sourceChainPath} mixer_device`;

  beforeEach(() => {
    mockWorkingDeviceMoves();
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

  /**
   * Register chain 1's mixer — the destination the trim would be carried to.
   * @param volumeProperties - Property overrides for its volume parameter
   * @returns The destination volume mock
   */
  function registerDestinationMixer(
    volumeProperties?: Record<string, unknown>,
  ): RegisteredMockObject {
    registerMockObject("mixer-1", {
      path: `${rackPath.chain(1)} mixer_device`,
    });

    return registerMockObject("volume-1", {
      path: `${rackPath.chain(1)} mixer_device volume`,
      properties: volumeProperties,
    });
  }

  it("carries the trim onto an untouched destination chain", () => {
    // chain-1 holds no devices and sits at defaults, so writing its fader
    // re-levels nothing — the trim follows the sound instead of stranding.
    const destinationVolume = registerDestinationMixer();

    updateDevice({ id: "device-0", toPath: "t0/d0/c1" });

    expect(destinationVolume.set).toHaveBeenCalledWith("display_value", -15);
    // Announced, because the caller asked to move a device, not to set a fader.
    expect(capturedWarnings()).toContain(
      'chain "Trimmed" t0/d0/c0 (id chain-0) trim (gainDb -15) carried onto the destination chain, which was empty and at defaults',
    );
    expect(capturedWarnings()).not.toContainEqual(
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

    updateDevice({ id: "device-0", toPath: "t0/d0/c1" });

    expect(capturedWarnings()).toContain(
      'chain "Trimmed" t0/d0/c0 (id chain-0) trim (gainDb -15) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn',
    );
  });

  it("warns instead of overwriting a destination chain with its own trim", () => {
    registerDestinationMixer({ display_value: 6 });

    updateDevice({ id: "device-0", toPath: "t0/d0/c1" });

    expect(capturedWarnings()).toContainEqual(
      expect.stringContaining("stays behind"),
    );
  });

  it("stays quiet when the device only moves within its own chain", () => {
    updateDevice({ id: "device-0", toPath: "t0/d0/c0/d1" });

    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("stays behind"),
    );
  });

  it("leaves the trim behind when the destination is in another rack", () => {
    // Sends match by return-chain name, which only lines up within one rack,
    // so carrying across racks wrote the gain and pan and dropped the sends.
    const otherRackPath = livePath.track(1).device(0);
    const destinationVolume = registerMockObject("other-volume", {
      path: `${otherRackPath.chain(0)} mixer_device volume`,
    });

    registerMockObject("other-rack", {
      path: otherRackPath,
      properties: { chains: children("other-chain") },
    });
    registerMockObject("other-chain", {
      path: otherRackPath.chain(0),
      type: "Chain",
    });
    registerMockObject("other-mixer", {
      path: `${otherRackPath.chain(0)} mixer_device`,
    });

    updateDevice({ id: "device-0", toPath: "t1/d0/c0" });

    expect(destinationVolume.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).toContain(
      'chain "Trimmed" t0/d0/c0 (id chain-0) trim (gainDb -15) stays behind — reapply on the destination chain with update-device gainDb/pan/sendGainDb+sendReturn',
    );
  });

  it("carries the sends too, counting them in the announcement", () => {
    registerMockObject("rack", {
      path: rackPath,
      properties: {
        chains: children("chain-0", "chain-1"),
        can_have_drum_pads: 0,
        return_chains: children("rc-0"),
      },
    });
    registerMockObject("rc-0", {
      type: "Chain",
      properties: { name: "a Rev" },
    });
    registerMockObject("mixer-0", {
      path: sourceMixerPath,
      properties: { sends: children("send-0") },
    });
    registerMockObject("send-0", {
      properties: { value: 0.5, display_value: -12 },
    });
    registerMockObject("mixer-1", {
      path: `${rackPath.chain(1)} mixer_device`,
      properties: { sends: children("send-1") },
    });
    registerMockObject("volume-1", {
      path: `${rackPath.chain(1)} mixer_device volume`,
    });

    const destinationSend = registerMockObject("send-1");

    updateDevice({ id: "device-0", toPath: "t0/d0/c1" });

    expect(destinationSend.set).toHaveBeenCalledWith("display_value", -12);
    expect(capturedWarnings()).toContain(
      'chain "Trimmed" t0/d0/c0 (id chain-0) trim (gainDb -15, 1 send) carried onto the destination chain, which was empty and at defaults',
    );
  });

  it("names what landed rather than what it set out to carry", () => {
    // A macro-mapped destination gain is skipped with its own warning, so
    // announcing the carry up front contradicted the very next line.
    registerDestinationMixer({ is_enabled: 0 });

    updateDevice({ id: "device-0", toPath: "t0/d0/c1" });

    expect(capturedWarnings()).toContain(
      'chain "Trimmed" t0/d0/c0 (id chain-0) trim could not be carried onto the destination chain — it stays on the chain the device left',
    );
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("carried onto the destination chain, which was"),
    );
  });

  it("leaves the trim alone when Live refuses the move", () => {
    // Registered without the move_device that lands the device, so the move
    // reads as refused. The device never arrived, so writing the destination
    // fader would re-level a chain nothing moved into.
    registerMockObject("live-set", { path: livePath.liveSet });

    const destinationVolume = registerDestinationMixer();

    updateDevice({ id: "device-0", toPath: "t0/d0/c1" });

    expect(capturedWarnings()).toContain(
      't0/d0/c0/d0 (id device-0) was not moved to "t0/d0/c1"',
    );
    expect(destinationVolume.set).not.toHaveBeenCalled();
    expect(capturedWarnings()).not.toContainEqual(
      expect.stringContaining("carried onto the destination chain"),
    );
  });
});
