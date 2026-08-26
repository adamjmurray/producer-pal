// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from "vitest";
import {
  type RegisteredMockObject,
  children,
  expectValueSet,
  livePath,
  registerMockObject,
  updateDevice,
} from "../update-device-test-helpers.ts";

// Discriminating cases for the param value-conversion pipeline. Each uses
// str_for_value mappings crafted so that a single mutated branch produces an
// observably different written value (or a warning instead of a write).
describe("updateDevice - param conversion discriminators", () => {
  describe("division detection uses current OR min label", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("div-param") },
      });
      // Current value (-3) reads as a division label, but the MIN value (-6)
      // reads as a plain number. Only an OR keeps this classified as a division
      // param; an AND would fall through to the numeric branch.
      param = registerMockObject("div-param", {
        properties: {
          name: "Rate",
          original_name: "Rate",
          is_quantized: 0,
          value: -3,
          min: -6,
          max: 0,
        },
        methods: {
          str_for_value: (v: unknown) => {
            if (v === -3) return "1/8";
            if (v === -4) return "1/16";
            if (v === -6) return "0.5";

            return String(v);
          },
        },
      });
    });

    it("resolves a division value when only the current label is a fraction", () => {
      updateDevice({ id: "dev1", params: [{ name: "Rate", value: "1/16" }] });

      // "1/16" resolves to raw -4 via the division path; a numeric-branch
      // fallthrough would fail to interpret the fraction and warn instead.
      expect(param.set).toHaveBeenCalledWith("value", -4);
      expect(outlet).not.toHaveBeenCalledWith(
        1,
        expect.stringContaining("could not interpret"),
      );
    });
  });

  describe("min-label-unparseable numeric fallback", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("mirror-param") },
      });
      // Mirror of the existing max-unparseable case: here the MIN label can't be
      // parsed while the max label can. The min-side null guard must short out to
      // the raw input, not proceed into a (bogus) linear/binary conversion.
      param = registerMockObject("mirror-param", {
        properties: {
          name: "Mirror",
          original_name: "Mirror",
          is_quantized: 0,
          value: 0.5,
          min: 0,
          max: 1,
        },
        methods: {
          str_for_value: (v: unknown) =>
            Number(v) <= 0 ? "custom" : `${1000 * Number(v)} Hz`,
        },
      });
    });

    it("falls back to the raw value when the min label is unparseable", () => {
      updateDevice({ id: "dev1", params: [{ name: "Mirror", value: "0.7" }] });

      // Unparseable min label => no linear range => write the raw input as-is.
      // Skipping the guard would binary-search a garbage value near the min.
      expect(param.set).toHaveBeenCalledWith("value", 0.7);
    });
  });

  describe("bare-number display labels arrive as numbers, not strings", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("bare-param") },
      });
      // Max hands back a JS number when a label has no unit or suffix. Display
      // runs 0..100 over a raw 0..1 range, non-linearly, so a write that skips
      // the search is unmistakable.
      param = registerMockObject("bare-param", {
        properties: {
          name: "Attack",
          original_name: "Attack",
          is_quantized: 0,
          value: 0,
          min: 0,
          max: 1,
        },
        methods: {
          str_for_value: (v: unknown) =>
            Math.round(Number(v) * Number(v) * 1000) / 10,
        },
      });
    });

    it("searches for the raw value instead of writing the display value", () => {
      updateDevice({ id: "dev1", params: [{ name: "Attack", value: "25" }] });

      // Display 25 sits at raw 0.5. Uncoerced, parseLabel rejects the numeric
      // label, the search bails, and 25 is written as a raw value — 25x past max.
      expect(expectValueSet(param)).toBeCloseTo(0.5, 2);
    });
  });

  describe("pan max value comes from the display labels, not the 50 fallback", () => {
    let param: RegisteredMockObject;

    beforeEach(() => {
      registerMockObject("dev1", {
        path: livePath.track(0).device(0),
        type: "Device",
        properties: { parameters: children("pan-param") },
      });
      // Display max is "100R" (not 50), so the pan scale is 0..100. The current
      // value reads as "C" (a pan label) so the pan branch is taken; any other
      // read (e.g. an empty property name) would read as a non-pan label.
      param = registerMockObject("pan-param", {
        properties: {
          name: "Pan",
          original_name: "Pan",
          is_quantized: 0,
          value: 0,
          min: -1,
          max: 1,
        },
        methods: {
          str_for_value: (v: unknown) => {
            if (v === 1) return "100R";
            if (v === -1) return "30L";
            if (v === 0) return "C";

            return "5000 Hz";
          },
        },
      });
    });

    it("scales a directional label by the param's own display max", () => {
      updateDevice({ id: "dev1", params: [{ name: "Pan", value: "50R" }] });

      // 50R on a 0..100 scale is +0.5; internal = ((0.5+1)/2)*(1-(-1)) + (-1)
      // = 0.5. The 50 fallback would read it as full-right (+1 -> internal 1).
      expect(expectValueSet(param)).toBeCloseTo(0.5, 5);
    });
  });
});
