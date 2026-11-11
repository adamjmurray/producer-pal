// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import "#src/live-api-adapter/live-api-extensions.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { children } from "#src/test/mocks/mock-live-api-property-helpers.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  SPECS,
  applySpecializedInactiveStates,
} from "../specialized-device-registry.ts";
import {
  type InactiveWhenRule,
  type PseudoParam,
  type SpecializedDeviceSpec,
} from "../specialized-device-types.ts";

// A param search can filter a rule's controller out of the list. Every rule on
// every device must still apply, with the controller read from the device and
// left out of the result. Walks the registry so a new rule is covered.

const RULED = SPECS.filter((spec) => spec.inactiveWhen != null);
const CASES = RULED.flatMap((spec) =>
  (spec.inactiveWhen as InactiveWhenRule[]).flatMap((rule) =>
    Object.entries(rule.cases).map(
      ([value, inactive]) => [spec, rule, value, inactive] as const,
    ),
  ),
);

/**
 * Every param a rule can switch, active or not.
 * @param rule - The rule
 * @returns The distinct param names
 */
function groupOf(rule: InactiveWhenRule): string[] {
  return [...new Set(Object.values(rule.cases).flat())];
}

/**
 * Register the device with the controller reading a value: a pseudo-param
 * reads it directly, anything else is a real DeviceParameter.
 * @param spec - The device's spec
 * @param controller - The controller's name
 * @param value - The value it reads
 * @returns The device and a count of the controller reads made
 */
function deviceWithController(
  spec: SpecializedDeviceSpec,
  controller: string,
  value: string,
): { device: LiveAPI; reads: () => number } {
  const pseudo = spec.params.find(
    (param: PseudoParam) => param.name === controller,
  );
  let spy: { mock: { calls: unknown[] } } | undefined;

  if (pseudo != null) {
    spy = vi.spyOn(pseudo, "read").mockReturnValue(value);
  } else {
    registerMockObject("controller", {
      type: "DeviceParameter",
      properties: {
        name: controller,
        original_name: controller,
        is_quantized: 1,
        is_enabled: 1,
        value: 0,
        value_items: [value],
        canonical_parent: children("dev-1"),
      },
    });
  }

  registerMockObject("dev-1", {
    type: "Device",
    properties: {
      class_display_name: spec.displayNames[0],
      parameters: pseudo == null ? children("controller") : [],
    },
  });

  const device = LiveAPI.from("id dev-1");
  const someChild = vi.spyOn(device, "someChild");

  return {
    device,
    reads: () => (spy ?? someChild).mock.calls.length,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inactive rules on a searched read", () => {
  it("covers a pseudo-param and a DeviceParameter controller", () => {
    const pseudo = RULED.some((spec) =>
      spec.inactiveWhen?.some((rule) =>
        spec.params.some((param) => param.name === rule.controller),
      ),
    );

    expect(pseudo).toBe(true);
    expect(CASES.length).toBeGreaterThan(0);
  });

  it.each(CASES)(
    "%# marks what the controller's value switches off",
    (spec, rule, value, inactive) => {
      const { device } = deviceWithController(spec, rule.controller, value);
      const listed = groupOf(rule).map((name) => ({ name, value: 1 }));

      applySpecializedInactiveStates(device, listed, true);

      expect(
        listed.filter((p) => "state" in p).map((p) => p.name),
      ).toStrictEqual(groupOf(rule).filter((name) => inactive.includes(name)));
      // The controller stays out of the result.
      expect(listed.map((p) => p.name)).toStrictEqual(groupOf(rule));
    },
  );

  it.each(CASES)(
    "%# reads the controller only when a listed param depends on it",
    (spec, rule, value) => {
      const { device, reads } = deviceWithController(
        spec,
        rule.controller,
        value,
      );

      applySpecializedInactiveStates(device, [{ name: "Gain" }], true);

      expect(reads()).toBe(0);
    },
  );

  it.each(CASES)(
    "%# adds no reads to an unsearched read",
    (spec, rule, value) => {
      const { device, reads } = deviceWithController(
        spec,
        rule.controller,
        value,
      );
      const [name] = groupOf(rule) as [string];

      applySpecializedInactiveStates(device, [{ name, value: 1 }]);

      expect(reads()).toBe(0);
    },
  );
});
