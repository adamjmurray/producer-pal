// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { deleteMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  type RegisteredMockObject,
  livePath,
  mockNonExistentObjects,
  registerMockObject,
  updateDevice,
} from "#src/tools/device/update/tests/update-device-test-helpers.ts";
import {
  clearMockWrites,
  getMockWrites,
} from "#src/test/mocks/registry/mock-write-log.ts";
import {
  type RegisteredDevice,
  registerCopyDevice,
  valuesOf,
  copyOnto,
  registerThresholdPair,
  entryFor,
} from "./copy-params-test-helpers.ts";

const NAMES = ["Threshold", "Ratio", "Gain"];

/**
 * Register a source (101) and a target (102), both Compressors with the same
 * three params.
 * @param source - The source's values
 * @param target - The target's values
 * @returns The two devices
 */
function registerPair(
  source: number[],
  target: number[],
): { source: RegisteredDevice; target: RegisteredDevice } {
  const named = (values: number[]): { name: string; value: number }[] =>
    values.map((value, index) => ({ name: NAMES[index] as string, value }));

  return {
    source: registerCopyDevice("101", { params: named(source) }),
    target: registerCopyDevice("102", { slot: 1, params: named(target) }),
  };
}

describe("updateDevice - copyParamsFrom", () => {
  beforeEach(() => {
    mockNonExistentObjects();
  });

  it("copies the source's values onto the target, counting the ones that changed", () => {
    const { source, target } = registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

    const result = copyOnto("102");

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: { params: 2 },
      }),
    );
    expect(valuesOf(target)).toStrictEqual([0.75, 0.25, 0.5]);
    expect(valuesOf(source)).toStrictEqual([0.75, 0.25, 0.5]);
  });

  it("names the source by path as well as by id", () => {
    const { target } = registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

    const result = copyOnto("102", { copyParamsFrom: "t0/d0" });

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: { params: 2 },
      }),
    );
    expect(valuesOf(target)).toStrictEqual([0.75, 0.25, 0.5]);
  });

  it("is a success that changes nothing when the target already matches", () => {
    registerPair([0.75, 0.25, 0.5], [0.75, 0.25, 0.5]);
    clearMockWrites();

    const result = copyOnto("102");

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: { params: 0 },
      }),
    );
    expect(getMockWrites()).toStrictEqual([]);
  });

  it("counts a value Max rounded in passing as a match", () => {
    registerPair([0.8031495809555054, 1000.004], [0.8031499981880188, 1000]);
    clearMockWrites();

    const result = copyOnto("102");

    expect(result).toStrictEqual(entryFor("102", { copied: { params: 0 } }));
    expect(getMockWrites()).toStrictEqual([]);
  });

  it("pairs by name when the lists differ, and counts what has no partner", () => {
    const source = registerCopyDevice("101", {
      params: [
        { name: "Threshold", value: 0.75 },
        { name: "Ratio", value: 0.25 },
        { name: "Only Source", value: 0.75 },
        { name: "Twice", value: 0.75 },
        { name: "Twice", value: 0.75 },
      ],
    });
    const target = registerCopyDevice("102", {
      slot: 1,
      params: [
        { name: "Gain", value: 0.5 },
        { name: "Ratio", value: 0.5 },
        { name: "Threshold", value: 0.5 },
        { name: "Twice", value: 0.5 },
      ],
    });

    const result = copyOnto("102");

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: { params: 2, skipped: ["5 params not on both devices"] },
      }),
    );
    expect(valuesOf(target)).toStrictEqual([0.5, 0.25, 0.75, 0.5]);
    expect(valuesOf(source)).toStrictEqual([0.75, 0.25, 0.75, 0.75, 0.75]);
  });

  it("leaves a param a rack macro owns, and says so", () => {
    const source = registerCopyDevice("101", {
      params: [
        { name: "Threshold", value: 0.75 },
        { name: "Ratio", value: 0.25 },
      ],
    });
    const target = registerCopyDevice("102", {
      slot: 1,
      params: [
        { name: "Threshold", value: 0.5, state: 2 },
        { name: "Ratio", value: 0.5 },
      ],
    });

    const result = copyOnto("102");

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: { params: 1, skipped: ["Threshold: mapped to a macro"] },
      }),
    );
    expect(valuesOf(target)).toStrictEqual([0.5, 0.25]);
    expect(valuesOf(source)).toStrictEqual([0.75, 0.25]);
  });

  it("copies params Live marks inactive", () => {
    const target = registerThresholdPair({ value: 0.5, state: 1 });

    copyOnto("102");

    expect(valuesOf(target)).toStrictEqual([0.75]);
  });

  it("is a success that skips a param Live refuses, saying why", () => {
    const { target } = registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

    (target.params[1] as RegisteredMockObject).set.mockImplementation(() => {
      throw new Error("Value cannot be set, the parameter is disabled");
    });

    const result = copyOnto("102");

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: {
          params: 1,
          skipped: ["Ratio: Value cannot be set, the parameter is disabled"],
        },
      }),
    );
  });

  it("lets params in the same call win over the copy", () => {
    const { target } = registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

    const result = updateDevice({
      id: "102",
      copyParamsFrom: "101",
      params: [{ name: "Threshold", value: "0.25" }],
    });

    expect(result).toStrictEqual(
      entryFor("102", {
        copied: { params: 2 },
        params: [{ id: "102-p0", name: "Threshold" }],
      }),
    );
    expect(valuesOf(target)).toStrictEqual([0.25, 0.25, 0.5]);
  });

  it("copies onto every target in the call", () => {
    registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

    const third = registerCopyDevice("103", {
      slot: 2,
      params: NAMES.map((name) => ({ name, value: 0.75 })),
    });

    const result = copyOnto("102,103");

    expect(result).toStrictEqual([
      { id: "102", path: "t0/d1", copied: { params: 2 } },
      { id: "103", path: "t0/d2", copied: { params: 2 } },
    ]);
    expect(valuesOf(third)).toStrictEqual([0.75, 0.25, 0.5]);
  });

  describe("what it refuses", () => {
    it("refuses a target of another type, naming both", () => {
      const { target } = registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

      target.device.properties.class_name = "Eq8Device";
      target.device.properties.class_display_name = "EQ Eight";
      clearMockWrites();

      expect(() => copyOnto("102")).toThrow(
        "not copied: the source is Compressor, not EQ Eight",
      );
      expect(getMockWrites()).toStrictEqual([]);
    });

    it("names a device's class when it has no display name", () => {
      const { target } = registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

      target.device.properties.class_name = "PluginDevice";
      delete target.device.properties.class_display_name;

      expect(() => copyOnto("102")).toThrow(
        "not copied: the source is Compressor, not PluginDevice",
      );
    });

    it("refuses only the targets it can't copy onto", () => {
      registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);
      registerCopyDevice("103", {
        slot: 2,
        className: "Eq8Device",
        displayName: "EQ Eight",
        params: NAMES.map((name) => ({ name, value: 0.5 })),
      });

      const result = copyOnto("102,103");

      expect(result).toStrictEqual([
        { id: "102", path: "t0/d1", copied: { params: 2 } },
        {
          id: "103",
          ok: false,
          detail: "not copied: the source is Compressor, not EQ Eight",
        },
      ]);
    });

    it("refuses the source as its own target", () => {
      registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

      expect(() => copyOnto("101")).toThrow(
        "not copied: this is the source device",
      );
    });

    it("refuses a source that is gone by the target's turn", () => {
      const { target } = registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

      // Writing the name stands in for an earlier step deleting the source.
      target.device.set.mockImplementation(() => {
        deleteMockObject("101");
      });

      const result = copyOnto("102", { name: "Copy" });

      expect(result).toStrictEqual({
        id: "102",
        // The source was d0, so the target slid up a place.
        path: "t0/d0",
        detail: "not copied: the source device is gone",
      });
    });

    it("refuses a source that doesn't exist before writing anything", () => {
      registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);
      clearMockWrites();

      expect(() => copyOnto("102", { copyParamsFrom: "999" })).toThrow(
        'copyParamsFrom "999" does not exist',
      );
      expect(() =>
        copyOnto("102", { copyParamsFrom: "t0/d9", name: "X" }),
      ).toThrow('nothing at copyParamsFrom "t0/d9"');
      expect(getMockWrites()).toStrictEqual([]);
    });

    it.each([
      ["chain", "Chain", String(livePath.track(0).device(0).chain(0))],
      [
        "drum pad",
        "DrumPad",
        `${String(livePath.track(0).device(0))} drum_pads 36`,
      ],
    ] as const)(
      "refuses a source that is a %s, before writing anything",
      (words, type, path) => {
        registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);
        registerMockObject("201", {
          path,
          type,
          properties: { note: 36 },
        });
        clearMockWrites();

        expect(() => copyOnto("102", { copyParamsFrom: "201" })).toThrow(
          `copyParamsFrom must name a device, not a ${words}: "201"`,
        );
        expect(getMockWrites()).toStrictEqual([]);
      },
    );

    it("ignores it on a target that is a chain", () => {
      registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);
      registerMockObject("201", {
        path: livePath.track(0).device(0).chain(0),
        type: "Chain",
      });

      expect(() => copyOnto("201")).toThrow("copyParamsFrom");
    });

    it.each([
      { id: "102", copyParamsFrom: "" },
      { id: "102", copyParamsFrom: "  " },
    ])("counts a blank source as asking nothing: %j", (args) => {
      registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

      expect(() => updateDevice(args)).toThrow("nothing to update");
    });

    it("refuses it with wrapInRack", () => {
      registerPair([0.75, 0.25, 0.5], [0.5, 0.5, 0.5]);

      expect(() =>
        copyOnto("102", { copyParamsFrom: "101", wrapInRack: true }),
      ).toThrow(
        "wrapInRack cannot be used with copyParamsFrom: wrap first, then update in another call",
      );
    });
  });
});
