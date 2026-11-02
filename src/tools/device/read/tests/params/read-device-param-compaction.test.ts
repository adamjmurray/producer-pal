// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What a `param-values` read leaves out or says once, on real device reads:
// Operator (195 params) and EQ Eight's filter params, as Live reported them.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { readOneDevice } from "../../read-device.ts";
import eqEightFixture from "./fixtures/eq-eight-filters-param-values.json" with { type: "json" };
import operatorFixture from "./fixtures/operator-param-values.json" with { type: "json" };

interface ReadParam {
  id: string;
  name: string;
  value: string | number;
  min?: number;
  max?: number;
  options?: string[];
  optionList?: string;
  state?: string;
  enabled?: boolean;
}

interface Fixture {
  type: string;
  parameters: ReadParam[];
}

interface DeviceRead {
  optionLists?: Record<string, string[]>;
  parameters: ReadParam[];
}

const STATES = ["active", "inactive", "disabled"];

/**
 * Whether a fixture param is an Off/On toggle (the old read listed its options).
 * @param param - A fixture param
 * @returns True when its options are Off and On
 */
function isToggle(param: ReadParam): boolean {
  return param.options?.join() === "Off,On";
}

/**
 * Register a device whose params are the fixture's, so reading it gives the
 * fixture back from Live's own value_items, states and ranges.
 * @param fixture - A read as the tool used to give it
 * @param className - The device's class name
 */
function registerDevice(fixture: Fixture, className: string): void {
  registerMockObject("device-123", {
    path: "id device-123",
    type: "Device",
    properties: {
      name: className,
      class_display_name: className,
      type: fixture.type.startsWith("instrument") ? 1 : 2,
      can_have_chains: 0,
      can_have_drum_pads: 0,
      is_active: 1,
      parameters: fixture.parameters.flatMap((p) => ["id", `param-${p.id}`]),
    },
  });

  for (const param of fixture.parameters) {
    const items = param.options ?? null;

    registerMockObject(`param-${param.id}`, {
      path: `id param-${param.id}`,
      type: "DeviceParameter",
      properties: {
        name: param.name,
        original_name: param.name,
        state: Math.max(0, STATES.indexOf(param.state ?? "active")),
        is_enabled: param.enabled === false ? 0 : 1,
        automation_state: 0,
        is_quantized: items == null ? 0 : 1,
        value_items: items ?? [],
        value: items == null ? param.value : items.indexOf(String(param.value)),
        min: param.min ?? 0,
        max: param.max ?? 1,
        display_value: param.value,
      },
      methods: { str_for_value: (value: unknown) => String(value) },
    });
  }
}

/**
 * Read the registered device with its param values.
 * @returns The read
 */
function readValues(): DeviceRead {
  return readOneDevice({
    id: "device-123",
    include: ["param-values"],
  }) as unknown as DeviceRead;
}

describe("a param-values read of Operator", () => {
  const before = (operatorFixture as Fixture).parameters;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerDevice(operatorFixture as Fixture, "Operator");
  });

  it("names no options for an Off/On toggle, whose value says them", () => {
    const { parameters } = readValues();
    const toggles = before.filter(isToggle);

    expect(toggles).toHaveLength(32);

    for (const toggle of toggles) {
      const read = parameters.find((p) => p.id === `param-${toggle.id}`);

      expect(read?.value).toBe(toggle.value);
      expect(read).not.toHaveProperty("options");
      expect(read).not.toHaveProperty("optionList");
    }
  });

  it("says each list that two or more params share once", () => {
    const { optionLists, parameters } = readValues();

    expect(Object.keys(optionLists ?? {})).toStrictEqual([
      "L1",
      "L2",
      "L3",
      "L4",
    ]);

    for (const param of parameters) {
      const original = before.find(
        (p) => `param-${p.id}` === param.id,
      )?.options;

      if (param.optionList != null) {
        expect(optionLists?.[param.optionList]).toStrictEqual(original);
        expect(param).not.toHaveProperty("options");
      }
    }

    expect(
      parameters.filter((p) => p.options != null).map((p) => p.name),
    ).toStrictEqual([
      "Algorithm",
      "LFO Type",
      "LFO Range",
      "Filter Type",
      "Filter Circuit - LP/HP",
      "Filter Circuit - BP/NO/Morph",
      "Filter Slope",
      "Shaper Type",
    ]);
  });

  it("keeps every param's value and state", () => {
    const { parameters } = readValues();

    expect(parameters).toHaveLength(before.length);
    expect(parameters.filter((p) => p.state === "inactive")).toHaveLength(70);
    expect(parameters.filter((p) => p.state === "disabled")).toHaveLength(6);

    for (const [i, param] of parameters.entries()) {
      expect(param.name).toBe(before[i]?.name);
      expect(param.value).toBe(before[i]?.value);
      expect(param.state).toBe(before[i]?.state);
    }
  });

  it("reads a good deal smaller than the old read", () => {
    const old = JSON.stringify(before).length;
    const now = JSON.stringify(readValues()).length;

    expect(now).toBeLessThan(old * 0.9);
  });
});

describe("a param-values read of EQ Eight's filters", () => {
  const before = (eqEightFixture as Fixture).parameters;

  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
    registerDevice(eqEightFixture as Fixture, "EQ Eight");
  });

  it("says the filter types once and drops the on/off lists", () => {
    const { optionLists, parameters } = readValues();
    const types = parameters.filter((p) => /Filter Type/.test(p.name));

    expect(optionLists).toStrictEqual({
      L1: [
        "High Pass 48dB",
        "High Pass 12dB",
        "Low Shelf",
        "Bell",
        "Notch",
        "High Shelf",
        "Low Pass 12dB",
        "Low Pass 48dB",
      ],
    });
    expect(types).toHaveLength(16);
    expect(types.every((p) => p.optionList === "L1")).toBe(true);
    expect(parameters.filter((p) => "options" in p)).toStrictEqual([]);
  });

  it("reads well under the size of the old read", () => {
    const old = JSON.stringify(before).length;
    const now = JSON.stringify(readValues()).length;

    expect(now).toBeLessThan(old * 0.65);
  });
});
