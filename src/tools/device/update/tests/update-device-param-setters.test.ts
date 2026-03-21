// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  livePath,
  registerMockObject,
  updateDevice,
} from "./update-device-test-helpers.ts";

describe("updateDevice - param value conversion", () => {
  describe("non-linear params (binary search)", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("env-param") },
      });
      // Simulate exponential envelope time: raw 0-1 → display 5-15000 ms
      param = registerMockObject("env-param", {
        properties: {
          name: "AEG1 Rel",
          original_name: "AEG1 Rel",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          str_for_value: (v: unknown) => {
            const display = 5 * Math.pow(15000 / 5, Number(v));

            return `${Math.round(display)} ms`;
          },
        },
      });
    });

    it("should find correct raw value via binary search", () => {
      updateDevice({ ids: "dev1", params: "AEG1 Rel = 600" });

      const setCall = param.set.mock.calls.find(
        (c: unknown[]) => c[0] === "value",
      ) as [string, number];

      expect(setCall).toBeDefined();

      const displayValue = 5 * Math.pow(15000 / 5, setCall[1]);

      expect(displayValue).toBeCloseTo(600, 0);
    });

    it("should handle target at min boundary", () => {
      updateDevice({ ids: "dev1", params: "AEG1 Rel = 5" });

      const setCall = param.set.mock.calls.find(
        (c: unknown[]) => c[0] === "value",
      ) as [string, number];

      expect(setCall).toBeDefined();
      expect(setCall[1]).toBeCloseTo(0, 1);
    });

    it("should handle target at max boundary", () => {
      updateDevice({ ids: "dev1", params: "AEG1 Rel = 15000" });

      const setCall = param.set.mock.calls.find(
        (c: unknown[]) => c[0] === "value",
      ) as [string, number];

      expect(setCall).toBeDefined();
      expect(setCall[1]).toBeCloseTo(1, 1);
    });
  });

  describe("unit normalization in binary search", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("time-param") },
      });
      param = registerMockObject("time-param", {
        properties: {
          name: "Decay",
          original_name: "Decay",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          // Switches between ms and s units depending on value
          str_for_value: (v: unknown) => {
            const ms = 1 + Number(v) * 9999;

            return ms >= 1000
              ? `${(ms / 1000).toFixed(2)} s`
              : `${Math.round(ms)} ms`;
          },
        },
      });
    });

    it("should handle s to ms unit normalization during binary search", () => {
      updateDevice({ ids: "dev1", params: "Decay = 5000" });

      const setCall = param.set.mock.calls.find(
        (c: unknown[]) => c[0] === "value",
      ) as [string, number];

      expect(setCall).toBeDefined();
      expect(1 + setCall[1] * 9999).toBeCloseTo(5000, -2);
    });
  });

  describe("unparseable labels fallback", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("weird-param") },
      });
      param = registerMockObject("weird-param", {
        properties: {
          name: "Special",
          original_name: "Special",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          str_for_value: () => "custom",
        },
      });
    });

    it("should fall back to raw value when min label is unparseable", () => {
      updateDevice({ ids: "dev1", params: "Special = 0.7" });

      expect(param.set).toHaveBeenCalledWith("value", 0.7);
    });
  });

  describe("partially unparseable labels", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("half-param") },
      });
      param = registerMockObject("half-param", {
        properties: {
          name: "HalfParsed",
          original_name: "HalfParsed",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          // Min label is parseable but max label is not
          str_for_value: (v: unknown) =>
            Number(v) < 0.5 ? `${Number(v)} Hz` : "custom",
        },
      });
    });

    it("should fall back when max label is unparseable", () => {
      updateDevice({ ids: "dev1", params: "HalfParsed = 0.3" });

      expect(param.set).toHaveBeenCalledWith("value", 0.3);
    });
  });

  describe("string value fallback", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("str-param") },
      });
      param = registerMockObject("str-param", {
        properties: {
          name: "Mode",
          original_name: "Mode",
          is_quantized: 0,
          value: 0,
          min: 0,
          max: 1,
        },
        methods: {
          str_for_value: (v: unknown) => String(v),
        },
      });
    });

    it("should set value directly for non-numeric string input", () => {
      updateDevice({ ids: "dev1", params: "Mode = custom-value" });

      expect(param.set).toHaveBeenCalledWith("value", "custom-value");
    });
  });

  describe("binary search with mid-iteration unparseable label", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("flaky-param") },
      });
      param = registerMockObject("flaky-param", {
        properties: {
          name: "Flaky",
          original_name: "Flaky",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          // Min/max labels parseable (triggers binary search),
          // but mid-range label becomes unparseable
          str_for_value: (v: unknown) => {
            const n = Number(v);

            if (n <= 0.01) return "0 Hz";
            if (n >= 0.99) return "1000 Hz";

            return "---";
          },
        },
      });
    });

    it("should converge toward min when mid-range labels parse as NaN", () => {
      updateDevice({ ids: "dev1", params: "Flaky = 500" });

      const setCall = param.set.mock.calls.find(
        (c: unknown[]) => c[0] === "value",
      ) as [string, number];

      expect(setCall).toBeDefined();
      // "---" parses as NaN (leading hyphens match the number regex).
      // NaN comparisons always false, so binary search treats it as
      // greater-than-target and converges hi toward lo (near rawMin).
      expect(setCall[1]).toBeCloseTo(0.01, 1);
    });
  });

  describe("param not found warning", () => {
    it("should warn when param name does not match any device parameter", () => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children() },
      });

      updateDevice({ ids: "dev1", params: "NonExistentParam = 0.5" });

      expect(outlet).toHaveBeenCalledWith(
        1,
        expect.stringContaining('"NonExistentParam" not found'),
      );
    });
  });
});
