// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading a device parameter back as a tool result. The label lexer this leans
// on is covered in device-display-helpers-labels.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STATE_MAP,
  PARAM_STATE_MAP,
  readParameter,
  readParameterBasic,
} from "../device-display-helpers.ts";

describe("device-display-helpers", () => {
  const mockGet = vi.fn();
  const mockCall = vi.fn();

  describe("state maps", () => {
    it("PARAM_STATE_MAP maps state codes to labels", () => {
      expect(PARAM_STATE_MAP[0]).toBe("active");
      expect(PARAM_STATE_MAP[1]).toBe("inactive");
      expect(PARAM_STATE_MAP[2]).toBe("disabled");
    });

    it("AUTOMATION_STATE_MAP maps automation codes to labels", () => {
      expect(AUTOMATION_STATE_MAP[0]).toBe("none");
      expect(AUTOMATION_STATE_MAP[1]).toBe("active");
      expect(AUTOMATION_STATE_MAP[2]).toBe("overridden");
    });
  });

  describe("readParameterBasic", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns id and name for a parameter", () => {
      mockGet.mockImplementation((prop: string) => {
        if (prop === "name") {
          return ["Volume"];
        }

        if (prop === "original_name") {
          return ["Volume"];
        }

        return [0];
      });

      const mockParamApi = {
        id: "param_1",
        get: mockGet,
        getProperty: (prop: string) => mockGet(prop)?.[0],
        getName: () => String(mockGet("name")?.[0] ?? ""),
      };

      const result = readParameterBasic(mockParamApi as unknown as LiveAPI);

      expect(result).toStrictEqual({
        id: "param_1",
        name: "Volume",
      });
    });

    it("reports an all-digit parameter name as a string", () => {
      // A rack macro name equal to its original_name too — the else-branch
      // return used to pass that raw number straight through.
      mockGet.mockImplementation((prop: string) => {
        if (prop === "name") {
          return [5678];
        }

        if (prop === "original_name") {
          return [5678];
        }

        return [0];
      });

      const mockParamApi = {
        id: "param_1b",
        get: mockGet,
        getProperty: (prop: string) => mockGet(prop)?.[0],
        getName: () => String(mockGet("name")?.[0] ?? ""),
      };

      const result = readParameterBasic(mockParamApi as unknown as LiveAPI);

      expect(result).toStrictEqual({
        id: "param_1b",
        name: "5678",
      });
    });

    it("formats name with original_name for rack macros", () => {
      mockGet.mockImplementation((prop: string) => {
        if (prop === "name") {
          return ["Reverb"];
        }

        if (prop === "original_name") {
          return ["Macro 1"];
        }

        return [0];
      });

      const mockParamApi = {
        id: "param_2",
        get: mockGet,
        getProperty: (prop: string) => mockGet(prop)?.[0],
        getName: () => String(mockGet("name")?.[0] ?? ""),
      };

      const result = readParameterBasic(mockParamApi as unknown as LiveAPI);

      expect(result).toStrictEqual({
        id: "param_2",
        name: "Reverb (Macro 1)",
      });
    });
  });

  describe("readParameter", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    const createMockParamApi = (id: string) =>
      ({
        id,
        get: mockGet,
        getProperty: (prop: string) => mockGet(prop)?.[0],
        getName: () => String(mockGet("name")?.[0] ?? ""),
        getPropertyList: (prop: string) => {
          const result: unknown = mockGet(prop);

          return Array.isArray(result) ? result : [];
        },
        call: mockCall,
      }) as unknown as LiveAPI;

    // Helper to setup mockGet mock for parameter tests
    interface ParamMockProps {
      name?: string;
      state?: number;
      automationState?: number;
      isQuantized?: number;
      value?: number;
      min?: number;
      max?: number;
      isEnabled?: number;
      valueItems?: string[];
    }

    // Helper to setup mockCall with a value-to-label map for str_for_value
    const setupValueLabels = (labels: Record<number, string>) => {
      mockCall.mockImplementation((method: string, value: number) => {
        if (method === "str_for_value") {
          return labels[value] ?? "";
        }

        return "";
      });
    };

    // Helper to setup mockCall with a division value map
    const setupDivisionMockCall = (
      divisionMap: Record<string, string | number>,
    ) => {
      mockCall.mockImplementation((method: string, value: number) => {
        if (method === "str_for_value") {
          return divisionMap[String(value)] ?? "";
        }

        return "";
      });
    };

    const setupParamMock = (props: ParamMockProps) => {
      const {
        name = "Param",
        state = 0,
        automationState = 0,
        isQuantized = 0,
        value = 0.5,
        min = 0,
        max = 1,
        isEnabled = 1,
        valueItems,
      } = props;

      mockGet.mockImplementation((prop: string) => {
        if (prop === "name") {
          return [name];
        }

        if (prop === "original_name") {
          return [name];
        }

        if (prop === "state") {
          return [state];
        }

        if (prop === "automation_state") {
          return [automationState];
        }

        if (prop === "is_quantized") {
          return [isQuantized];
        }

        if (prop === "value") {
          return [value];
        }

        if (prop === "min") {
          return [min];
        }

        if (prop === "max") {
          return [max];
        }

        if (prop === "is_enabled") {
          return [isEnabled];
        }

        if (prop === "value_items" && valueItems) {
          return valueItems;
        }

        return [0];
      });
    };

    it("reads quantized parameter with value_items", () => {
      const valueItems = ["Off", "On", "Auto"];

      mockGet.mockImplementation((prop) => {
        if (prop === "name") {
          return ["Mode"];
        }

        if (prop === "original_name") {
          return ["Mode"];
        }

        if (prop === "state") {
          return [0];
        } // active

        if (prop === "automation_state") {
          return [0];
        } // none

        if (prop === "is_quantized") {
          return [1];
        }

        if (prop === "value") {
          return [1];
        } // "On"

        if (prop === "value_items") {
          return valueItems;
        }

        if (prop === "is_enabled") {
          return [1];
        }

        return [0];
      });

      const result = readParameter(createMockParamApi("param_3"));

      expect(result).toStrictEqual({
        id: "param_3",
        name: "Mode",
        value: "On",
        options: valueItems,
      });
    });

    it("reads continuous parameter with dB unit", () => {
      setupParamMock({ name: "Volume", value: 0.85 });
      setupValueLabels({ 0.85: "0 dB", 0: "-inf dB", 1: "6 dB" });

      const result = readParameter(createMockParamApi("param_4"));

      expect(result).toStrictEqual({
        id: "param_4",
        name: "Volume",
        value: 0,
        min: -70,
        max: 6,
        unit: "dB",
      });
    });

    it("reads pan parameter and normalizes to -1 to 1", () => {
      setupParamMock({ name: "Pan", value: 0.25 });
      setupValueLabels({ 0.25: "25L", 0: "50L", 1: "50R" });

      const result = readParameter(createMockParamApi("param_5"));

      expect(result).toStrictEqual({
        id: "param_5",
        name: "Pan",
        value: -0.5,
        min: -1,
        max: 1,
        unit: "pan",
      });
    });

    it("includes state flag when not active", () => {
      setupParamMock({ name: "Cutoff", state: 1 });
      mockCall.mockReturnValue("0.5");

      const result = readParameter(createMockParamApi("param_6"));

      expect(result.state).toBe("inactive");
    });

    it("includes automation flag when active", () => {
      setupParamMock({ name: "Filter", automationState: 1 });
      mockCall.mockReturnValue("0.5");

      const result = readParameter(createMockParamApi("param_7"));

      expect(result.automation).toBe("active");
    });

    it("includes enabled=false when parameter is disabled", () => {
      setupParamMock({ isEnabled: 0 });
      mockCall.mockReturnValue("0.5");

      const result = readParameter(createMockParamApi("param_8"));

      expect(result.enabled).toBe(false);
    });

    it("reads division parameter with enum-like value and options", () => {
      // Division params like Echo's L Division have raw values -6 to 0
      // that map to "1/64" through "1"
      setupParamMock({
        name: "L Division",
        value: -3, // corresponds to "1/8"
        min: -6,
        max: 0,
      });

      // Map raw values to division strings
      setupDivisionMockCall({
        "-6": "1/64",
        "-5": "1/32",
        "-4": "1/16",
        "-3": "1/8",
        "-2": "1/4",
        "-1": "1/2",
        "0": 1, // Note: returns number, not string
      });

      const result = readParameter(createMockParamApi("param_9"));

      expect(result).toStrictEqual({
        id: "param_9",
        name: "L Division",
        value: "1/8",
        options: ["1/64", "1/32", "1/16", "1/8", "1/4", "1/2", "1"],
      });
    });

    it("reads pan parameter at center position", () => {
      setupParamMock({ name: "Pan", value: 0.5 });
      setupValueLabels({ 0.5: "C", 0: "50L", 1: "50R" });

      const result = readParameter(createMockParamApi("param_pan_c"));

      expect(result).toStrictEqual({
        id: "param_pan_c",
        name: "Pan",
        value: 0,
        min: -1,
        max: 1,
        unit: "pan",
      });
    });

    it("reads continuous parameter with Hz unit", () => {
      setupParamMock({ name: "Frequency", value: 0.5 });
      setupValueLabels({ 0.5: "1.00 kHz", 0: "20 Hz", 1: "20.0 kHz" });

      const result = readParameter(createMockParamApi("param_freq"));

      expect(result).toStrictEqual({
        id: "param_freq",
        name: "Frequency",
        value: 1000,
        min: 20,
        max: 20000,
        unit: "Hz",
      });
    });

    it("takes the unit from the value label when min and max have none", () => {
      // unit resolves value ?? min ?? max — the value label alone must be able
      // to supply it.
      setupParamMock({ name: "Amount", value: 0.5 });
      setupValueLabels({ 0.5: "50 %", 0: "0", 1: "100" });

      const result = readParameter(createMockParamApi("param_unit_value_only"));

      expect(result.unit).toBe("%");
    });

    it("normalizes pan against a non-default max pan value", () => {
      // maxPanValue comes from the max label (64), not the 50 default: 32 of 64
      // is half-left.
      setupParamMock({ name: "Pan", value: 0.25 });
      setupValueLabels({ 0.25: "32L", 0: "0L", 1: "64R" });

      const result = readParameter(createMockParamApi("param_pan_64"));

      expect(result.unit).toBe("pan");
      expect(result.value).toBe(-0.5);
    });

    it("reads parameter with no unit detected", () => {
      setupParamMock({ name: "Amount", value: 0.5 });
      setupValueLabels({ 0.5: "50", 0: "0", 1: "100" });

      const result = readParameter(createMockParamApi("param_amt"));

      expect(result).toStrictEqual({
        id: "param_amt",
        name: "Amount",
        value: 50,
        min: 0,
        max: 100,
      });
    });

    it("reads parameter with unparseable labels using display_value", () => {
      setupParamMock({ name: "Mode" });

      mockGet.mockImplementation((prop: string) => {
        if (prop === "name") {
          return ["Mode"];
        }

        if (prop === "original_name") {
          return ["Mode"];
        }

        if (prop === "state") {
          return [0];
        }

        if (prop === "automation_state") {
          return [0];
        }

        if (prop === "is_quantized") {
          return [0];
        }

        if (prop === "value") {
          return [0.5];
        }

        if (prop === "min") {
          return [0];
        }

        if (prop === "max") {
          return [1];
        }

        if (prop === "is_enabled") {
          return [1];
        }

        if (prop === "display_value") {
          return ["Repitch"];
        }

        return [0];
      });

      mockCall.mockImplementation(() => "Repitch");

      const result = readParameter(createMockParamApi("param_mode"));

      // Value falls back to display_value when label can't be parsed to a number
      expect(result.name).toBe("Mode");
      expect(result.value).toBe("Repitch");
    });

    it.each([
      { min: "50L", label: "min label" },
      { min: "0L", label: "default 50" },
    ])(
      "resolves pan maxPanValue via $label when the max label yields 0",
      ({ min }) => {
        // max label "0R" → extractMaxPanValue 0, forcing the || fallback chain.
        setupParamMock({ name: "Pan", value: 0.25 });
        setupValueLabels({ 0.25: "25L", 0: min, 1: "0R" });

        const result = readParameter(createMockParamApi("param_pan_fallback"));

        expect(result.unit).toBe("pan");
      },
    );

    it("falls back to rawValue when label unparseable and display_value is absent", () => {
      setupParamMock({ name: "Mode", value: 0.5 });

      // Override only display_value to a nullish read so the `?? rawValue`
      // tail of the value chain is exercised.
      const base = mockGet.getMockImplementation() as (p: string) => unknown[];

      mockGet.mockImplementation((prop: string) =>
        prop === "display_value" ? [] : base(prop),
      );
      mockCall.mockImplementation(() => "Repitch"); // unparseable label

      const result = readParameter(createMockParamApi("param_raw_fallback"));

      expect(result.value).toBe(0.5); // rawValue
    });

    it("handles division param detected via minLabel", () => {
      // Edge case: current value is "1" (not a fraction) but min is "1/64"
      setupParamMock({ name: "Division", value: 0, min: -2, max: 0 });

      setupDivisionMockCall({
        "-2": "1/4",
        "-1": "1/2",
        "0": 1,
      });

      const result = readParameter(createMockParamApi("param_10"));

      expect(result).toStrictEqual({
        id: "param_10",
        name: "Division",
        value: "1",
        options: ["1/4", "1/2", "1"],
      });
    });
  });
});
