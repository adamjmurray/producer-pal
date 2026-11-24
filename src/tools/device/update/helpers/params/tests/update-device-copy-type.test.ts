// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import {
  type WrapperMessage,
  infoReply,
  installWrapper,
} from "#src/tools/device/tests/helpers/plugin-host-wrapper-fixtures.ts";
import {
  livePath,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/tools/device/update/tests/update-device-test-helpers.ts";
import {
  type DeviceSpec,
  copyOnto,
  entryFor,
  registerCopyDevice,
  valuesOf,
} from "./copy-params-test-helpers.ts";

const PARAMS = [
  { name: "Cutoff", value: 0.75 },
  { name: "Mix", value: 0.25 },
];

/**
 * Register a source (101) and a target (102) of the same class, each with its
 * own type name and params.
 * @param className - Live's class for both
 * @param source - What the source differs in
 * @param target - What the target differs in
 * @returns The target
 */
function registerOfClass(
  className: string,
  source: Partial<DeviceSpec>,
  target: Partial<DeviceSpec>,
): ReturnType<typeof registerCopyDevice> {
  registerCopyDevice("101", { className, params: PARAMS, ...source });

  return registerCopyDevice("102", {
    slot: 1,
    className,
    params: PARAMS.map((param) => ({ ...param, value: 0.5 })),
    ...target,
  });
}

/**
 * Register a plug-in host wrapper's two Live params and its slots.
 * @param plugin - What `info` says it hosts
 * @param slots - What each of its slots drives, as `[slot, plug-in param]`
 * @returns A reply for each op, keyed by what the bus is asked
 */
function wrapperAnswers(
  plugin: Record<string, string>,
  slots: Record<string, Array<[number, number]>>,
): Record<string, (request: WrapperMessage) => WrapperMessage> {
  const of = (request: WrapperMessage): string => String(request.deviceId);

  return {
    info: (request) => infoReply(plugin[of(request)] ?? null),
    slots: (request) => ({
      success: true,
      slotCount: 128,
      slots: (slots[of(request)] ?? []).map(([slot, index]) => ({
        slot,
        index,
        name: `P${index}`,
      })),
    }),
  };
}

const WRAPPER = {
  className: "MxDeviceAudioEffect",
  displayName: "Max Audio Effect",
  params: [
    { name: "Device On", value: 1 },
    { name: "Slot 001", value: 0.75 },
    { name: "Slot 002", value: 0.25 },
  ],
};

describe("updateDevice - copyParamsFrom, plug-in and Max devices", () => {
  beforeEach(() => {
    mockNonExistentObjects();
  });

  it("refuses two different VSTs", () => {
    registerOfClass(
      "PluginDevice",
      { displayName: "Serum" },
      { displayName: "Diva" },
    );

    expect(() => copyOnto("102")).toThrow(
      "not copied: the source is Serum, not Diva",
    );
  });

  it("refuses two different AUs", () => {
    registerOfClass(
      "AuPluginDevice",
      { displayName: "AUDelay" },
      { displayName: "AUReverb" },
    );

    expect(() => copyOnto("102")).toThrow(
      "not copied: the source is AUDelay, not AUReverb",
    );
  });

  it("refuses two unrelated Max devices", () => {
    registerOfClass(
      "MxDeviceAudioEffect",
      { displayName: "LFO" },
      { displayName: "Shaper" },
    );

    expect(() => copyOnto("102")).toThrow(
      "not copied: the source is LFO, not Shaper",
    );
  });

  it.each([
    ["MxDeviceAudioEffect", "Max Audio Effect"],
    ["MxDeviceInstrument", "Max Instrument"],
  ])("refuses unrelated %s devices by their params", (className, name) => {
    registerOfClass(
      className,
      { displayName: name },
      { displayName: name, params: [{ name: "Other", value: 0.5 }] },
    );

    expect(() => copyOnto("102")).toThrow(
      `not copied: both are ${name}, but they list different params`,
    );
  });

  it("refuses a Max device of the same type that lists other params", () => {
    registerOfClass(
      "MxDeviceMidiEffect",
      { displayName: "Max MIDI Effect" },
      {
        displayName: "Max MIDI Effect",
        params: [
          { name: "Cutoff", value: 0.5 },
          { name: "Other", value: 0.5 },
        ],
      },
    );

    expect(() => copyOnto("102")).toThrow(
      "not copied: both are Max MIDI Effect, but they list different params",
    );
  });

  it("refuses the same params in another order", () => {
    registerOfClass(
      "PluginDevice",
      { displayName: "Serum" },
      { displayName: "Serum", params: PARAMS.toReversed() },
    );

    expect(() => copyOnto("102")).toThrow(
      "not copied: both are Serum, but they list different params",
    );
  });

  it("copies between two of the same VST", () => {
    const target = registerOfClass(
      "PluginDevice",
      { displayName: "Serum" },
      { displayName: "Serum" },
    );

    expect(copyOnto("102")).toStrictEqual(
      entryFor("102", { copied: { params: 2 } }),
    );
    expect(valuesOf(target)).toStrictEqual([0.75, 0.25]);
  });

  it("copies between two of the same Max device", () => {
    registerOfClass(
      "MxDeviceInstrument",
      { displayName: "Synth" },
      { displayName: "Synth" },
    );

    expect(copyOnto("102")).toStrictEqual(
      entryFor("102", { copied: { params: 2 } }),
    );
  });

  it("refuses the Producer Pal device as a target", () => {
    registerOfClass(
      "MxDeviceMidiEffect",
      { displayName: "Max MIDI Effect" },
      { displayName: "Max MIDI Effect" },
    );
    registerMockObject("this_device", {
      path: "this_device",
      returnPath: String(livePath.track(0).device(1)),
    });

    expect(() => copyOnto("102")).toThrow(
      "not copied: the Producer Pal device can't be copied from or onto",
    );
  });

  it("refuses the Producer Pal device as the source", () => {
    registerOfClass(
      "MxDeviceMidiEffect",
      { displayName: "Max MIDI Effect" },
      { displayName: "Max MIDI Effect" },
    );
    registerMockObject("this_device", {
      path: "this_device",
      returnPath: String(livePath.track(0).device(0)),
    });

    expect(() => copyOnto("102")).toThrow(
      "not copied: the Producer Pal device can't be copied from or onto",
    );
  });

  it("doesn't refuse a rack that holds the Producer Pal device", () => {
    registerOfClass("Compressor2Device", {}, {});
    registerMockObject("this_device", {
      path: "this_device",
      returnPath: `${livePath.track(0).device(1)} chains 0 devices 0`,
    });

    expect(copyOnto("102")).toStrictEqual(
      entryFor("102", { copied: { params: 2 } }),
    );
  });

  it("refuses only the targets of another plug-in", () => {
    registerOfClass(
      "PluginDevice",
      { displayName: "Serum" },
      { displayName: "Serum" },
    );
    registerCopyDevice("103", {
      slot: 2,
      className: "PluginDevice",
      displayName: "Diva",
      params: PARAMS,
    });

    expect(copyOnto("102,103")).toStrictEqual([
      entryFor("102", { copied: { params: 2 } }),
      {
        id: "103",
        ok: false,
        detail: "not copied: the source is Serum, not Diva",
      },
    ]);
  });

  it("treats a Max device with slot params as a plug-in host that must answer", () => {
    registerOfClass("MxDeviceAudioEffect", WRAPPER, WRAPPER);
    // No wrapper answers: these are plain Max devices that happen to have slots.

    expect(() => copyOnto("102")).toThrow(
      "not copied: neither plug-in host answered",
    );
  });

  describe("plug-in host wrappers", () => {
    const SAME_SLOTS: Array<[number, number]> = [
      [1, 10],
      [2, 20],
    ];

    /**
     * Register two wrappers with the same Live params.
     * @returns The target
     */
    function registerWrappers(): ReturnType<typeof registerCopyDevice> {
      return registerOfClass("MxDeviceAudioEffect", WRAPPER, {
        ...WRAPPER,
        params: WRAPPER.params.map((param) => ({ ...param, value: 0.5 })),
      });
    }

    it("refuses wrappers that host different plug-ins", () => {
      registerWrappers();
      installWrapper(
        wrapperAnswers(
          { "101": "Serum 2", "102": "Diva" },
          { "101": SAME_SLOTS, "102": SAME_SLOTS },
        ),
      );

      expect(() => copyOnto("102")).toThrow(
        "not copied: the source hosts Serum 2, not Diva",
      );
    });

    it("refuses wrappers of one plug-in that map a slot differently", () => {
      registerWrappers();
      installWrapper(
        wrapperAnswers(
          { "101": "Serum 2", "102": "Serum 2" },
          {
            "101": SAME_SLOTS,
            "102": [
              [1, 10],
              [2, 21],
            ],
          },
        ),
      );

      expect(() => copyOnto("102")).toThrow(
        "not copied: the two Serum 2 hosts map their slots to different plug-in params",
      );
    });

    it("refuses wrappers when one maps a slot the other leaves free", () => {
      registerWrappers();
      installWrapper(
        wrapperAnswers(
          { "101": "Serum 2", "102": "Serum 2" },
          { "101": SAME_SLOTS, "102": [[1, 10]] },
        ),
      );

      expect(() => copyOnto("102")).toThrow(
        "map their slots to different plug-in params",
      );
    });

    it("refuses when a wrapper's slots can't be read", () => {
      registerWrappers();
      installWrapper({
        ...wrapperAnswers({ "101": "Serum 2", "102": "Serum 2" }, {}),
        slots: () => ({ success: false, error: "boom" }),
      });

      expect(() => copyOnto("102")).toThrow(
        "not copied: the source's slots can't be read: couldn't read the automation slots: boom",
      );
    });

    it("refuses a wrapper with no plug-in loaded", () => {
      registerWrappers();
      installWrapper(
        wrapperAnswers({ "101": "Serum 2" }, { "101": SAME_SLOTS }),
      );

      expect(() => copyOnto("102")).toThrow(
        "not copied: the target plug-in host has no plug-in loaded",
      );
    });

    it.each([
      [["102"], "the source plug-in host didn't answer"],
      [["101"], "the target plug-in host didn't answer"],
      [[], "neither plug-in host answered"],
    ])(
      "refuses a wrapper that hasn't answered (answering: %j)",
      (answering, reason) => {
        registerWrappers();
        installWrapper({
          ...wrapperAnswers(
            { "101": "Serum 2", "102": "Serum 2" },
            { "101": SAME_SLOTS, "102": SAME_SLOTS },
          ),
          info: (request) =>
            answering.includes(String(request.deviceId))
              ? infoReply("Serum 2")
              : (undefined as never),
        });

        expect(() => copyOnto("102")).toThrow(`not copied: ${reason}`);
      },
    );

    it("refuses a wrapper that is out of date and has no slots op", () => {
      registerWrappers();
      installWrapper({
        ...wrapperAnswers({ "101": "Serum 2", "102": "Serum 2" }, {}),
        slots: () => ({ success: false, error: "unknown op slots" }),
      });

      expect(() => copyOnto("102")).toThrow(
        "not copied: the source's slots can't be read: this wrapper is out of date; create the hosted plug-in again",
      );
    });

    it("copies between wrappers of one plug-in with the same slots", () => {
      const target = registerWrappers();

      installWrapper(
        wrapperAnswers(
          { "101": "Serum 2", "102": "Serum 2" },
          { "101": SAME_SLOTS, "102": SAME_SLOTS },
        ),
      );

      expect(copyOnto("102")).toStrictEqual(
        entryFor("102", { copied: { params: 3 } }),
      );
      expect(valuesOf(target)).toStrictEqual([1, 0.75, 0.25]);
    });
  });
});
