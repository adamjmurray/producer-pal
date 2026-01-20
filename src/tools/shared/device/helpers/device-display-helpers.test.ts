import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiCall, liveApiGet } from "#src/test/mocks/mock-live-api.ts";
import {
  AUTOMATION_STATE_MAP,
  PARAM_STATE_MAP,
  extractMaxPanValue,
  isDivisionLabel,
  isPanLabel,
  normalizePan,
  parseLabel,
  readParameter,
  readParameterBasic,
} from "./device-display-helpers.ts";

describe("device-display-helpers", () => {
  describe("parseLabel", () => {
    describe("frequency (Hz)", () => {
      it("parses kHz and converts to Hz", () => {
        expect(parseLabel("1.00 kHz")).toStrictEqual({
          value: 1000,
          unit: "Hz",
        });
        expect(parseLabel("12.5 kHz")).toStrictEqual({
          value: 12500,
          unit: "Hz",
        });
        expect(parseLabel("0.5 kHz")).toStrictEqual({ value: 500, unit: "Hz" });
      });

      it("parses Hz directly", () => {
        expect(parseLabel("440 Hz")).toStrictEqual({ value: 440, unit: "Hz" });
        expect(parseLabel("20 Hz")).toStrictEqual({ value: 20, unit: "Hz" });
      });
    });

    describe("time (ms)", () => {
      it("parses seconds and converts to ms", () => {
        expect(parseLabel("1.00 s")).toStrictEqual({ value: 1000, unit: "ms" });
        expect(parseLabel("0.5 s")).toStrictEqual({ value: 500, unit: "ms" });
        expect(parseLabel("2.5 s")).toStrictEqual({ value: 2500, unit: "ms" });
      });

      it("parses ms directly", () => {
        expect(parseLabel("100 ms")).toStrictEqual({ value: 100, unit: "ms" });
        expect(parseLabel("500 ms")).toStrictEqual({ value: 500, unit: "ms" });
      });
    });

    describe("decibels (dB)", () => {
      it("parses positive and negative dB values", () => {
        expect(parseLabel("0 dB")).toStrictEqual({ value: 0, unit: "dB" });
        expect(parseLabel("-6 dB")).toStrictEqual({ value: -6, unit: "dB" });
        expect(parseLabel("-18.5 dB")).toStrictEqual({
          value: -18.5,
          unit: "dB",
        });
        expect(parseLabel("3 dB")).toStrictEqual({ value: 3, unit: "dB" });
      });

      it("converts -inf dB to -70", () => {
        expect(parseLabel("-inf dB")).toStrictEqual({ value: -70, unit: "dB" });
      });
    });

    describe("percentage (%)", () => {
      it("parses percentage values", () => {
        expect(parseLabel("0 %")).toStrictEqual({ value: 0, unit: "%" });
        expect(parseLabel("50 %")).toStrictEqual({ value: 50, unit: "%" });
        expect(parseLabel("100 %")).toStrictEqual({ value: 100, unit: "%" });
        expect(parseLabel("-50 %")).toStrictEqual({ value: -50, unit: "%" });
      });
    });

    describe("semitones (st)", () => {
      it("parses semitone values", () => {
        expect(parseLabel("0 st")).toStrictEqual({
          value: 0,
          unit: "semitones",
        });
        expect(parseLabel("+12 st")).toStrictEqual({
          value: 12,
          unit: "semitones",
        });
        expect(parseLabel("-24 st")).toStrictEqual({
          value: -24,
          unit: "semitones",
        });
        expect(parseLabel("7 st")).toStrictEqual({
          value: 7,
          unit: "semitones",
        });
      });
    });

    describe("note names", () => {
      it("parses note names and keeps as string", () => {
        expect(parseLabel("C4")).toStrictEqual({ value: "C4", unit: "note" });
        expect(parseLabel("F#-1")).toStrictEqual({
          value: "F#-1",
          unit: "note",
        });
        expect(parseLabel("Bb3")).toStrictEqual({ value: "Bb3", unit: "note" });
        expect(parseLabel("G#8")).toStrictEqual({ value: "G#8", unit: "note" });
      });
    });

    describe("pan", () => {
      it("parses pan labels with direction", () => {
        expect(parseLabel("50L")).toStrictEqual({
          value: 50,
          unit: "pan",
          direction: "L",
        });
        expect(parseLabel("50R")).toStrictEqual({
          value: 50,
          unit: "pan",
          direction: "R",
        });
        expect(parseLabel("25L")).toStrictEqual({
          value: 25,
          unit: "pan",
          direction: "L",
        });
      });

      it("parses center pan as fixed value", () => {
        expect(parseLabel("C")).toStrictEqual({ value: 0, unit: "pan" });
      });
    });

    describe("unitless numbers", () => {
      it("extracts numbers without units", () => {
        expect(parseLabel("76")).toStrictEqual({ value: 76, unit: null });
        expect(parseLabel("0.5")).toStrictEqual({ value: 0.5, unit: null });
        expect(parseLabel("-3.5")).toStrictEqual({ value: -3.5, unit: null });
      });
    });

    describe("edge cases", () => {
      it("returns null for non-parseable strings", () => {
        expect(parseLabel("Repitch")).toStrictEqual({
          value: null,
          unit: null,
        });
        expect(parseLabel("Off")).toStrictEqual({ value: null, unit: null });
      });

      it("handles null/undefined/non-string input", () => {
        expect(parseLabel(null as unknown as string)).toStrictEqual({
          value: null,
          unit: null,
        });
        expect(parseLabel(undefined as unknown as string)).toStrictEqual({
          value: null,
          unit: null,
        });
        expect(parseLabel(123 as unknown as string)).toStrictEqual({
          value: null,
          unit: null,
        });
      });
    });
  });

  describe("isPanLabel", () => {
    it("returns true for pan labels", () => {
      expect(isPanLabel("50L")).toBe(true);
      expect(isPanLabel("50R")).toBe(true);
      expect(isPanLabel("C")).toBe(true);
      expect(isPanLabel("25L")).toBe(true);
    });

    it("returns false for non-pan labels", () => {
      expect(isPanLabel("50 Hz")).toBe(false);
      expect(isPanLabel("Center")).toBe(false);
      expect(isPanLabel(null as unknown as string)).toBe(false);
      expect(isPanLabel(undefined as unknown as string)).toBe(false);
    });
  });

  describe("isDivisionLabel", () => {
    it("returns true for division fraction labels", () => {
      expect(isDivisionLabel("1/8")).toBe(true);
      expect(isDivisionLabel("1/16")).toBe(true);
      expect(isDivisionLabel("1/64")).toBe(true);
      expect(isDivisionLabel("1/4")).toBe(true);
      expect(isDivisionLabel("1/2")).toBe(true);
    });

    it("returns false for non-division labels", () => {
      expect(isDivisionLabel("2/4")).toBe(false); // must start with 1/
      expect(isDivisionLabel("1")).toBe(false);
      expect(isDivisionLabel("1/")).toBe(false);
      expect(isDivisionLabel("50 Hz")).toBe(false);
      expect(isDivisionLabel(null as unknown as string)).toBe(false);
      expect(isDivisionLabel(undefined as unknown as string)).toBe(false);
      expect(isDivisionLabel(123 as unknown as string)).toBe(false);
    });
  });

  describe("normalizePan", () => {
    it("normalizes pan values to -1 to 1", () => {
      expect(normalizePan("50L", 50)).toBe(-1);
      expect(normalizePan("50R", 50)).toBe(1);
      expect(normalizePan("25L", 50)).toBe(-0.5);
      expect(normalizePan("25R", 50)).toBe(0.5);
      expect(normalizePan("C", 50)).toBe(0);
    });

    it("handles different max pan values", () => {
      expect(normalizePan("64L", 64)).toBe(-1);
      expect(normalizePan("64R", 64)).toBe(1);
      expect(normalizePan("32L", 64)).toBe(-0.5);
    });
  });

  describe("extractMaxPanValue", () => {
    it("extracts max pan value from label", () => {
      expect(extractMaxPanValue("50L")).toBe(50);
      expect(extractMaxPanValue("50R")).toBe(50);
      expect(extractMaxPanValue("64L")).toBe(64);
    });

    it("returns default 50 for non-matching labels", () => {
      expect(extractMaxPanValue("C")).toBe(50);
      expect(extractMaxPanValue("invalid")).toBe(50);
    });
  });

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
      liveApiGet.mockImplementation((prop: string) => {
        if (prop === "name") return ["Volume"];
        if (prop === "original_name") return ["Volume"];

        return [0];
      });

      const mockParamApi = {
        id: "param_1",
        get: liveApiGet,
        getProperty: (prop: string) => liveApiGet(prop)?.[0],
      };

      const result = readParameterBasic(mockParamApi as unknown as LiveAPI);

      expect(result).toStrictEqual({
        id: "param_1",
        name: "Volume",
      });
    });

    it("formats name with original_name for rack macros", () => {
      liveApiGet.mockImplementation((prop: string) => {
        if (prop === "name") return ["Reverb"];
        if (prop === "original_name") return ["Macro 1"];

        return [0];
      });

      const mockParamApi = {
        id: "param_2",
        get: liveApiGet,
        getProperty: (prop: string) => liveApiGet(prop)?.[0],
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
        get: liveApiGet,
        getProperty: (prop: string) => liveApiGet(prop)?.[0],
        call: liveApiCall,
      }) as unknown as LiveAPI;

    // Helper to setup liveApiGet mock for parameter tests
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

      liveApiGet.mockImplementation((prop: string) => {
        if (prop === "name") return [name];
        if (prop === "original_name") return [name];
        if (prop === "state") return [state];
        if (prop === "automation_state") return [automationState];
        if (prop === "is_quantized") return [isQuantized];
        if (prop === "value") return [value];
        if (prop === "min") return [min];
        if (prop === "max") return [max];
        if (prop === "is_enabled") return [isEnabled];
        if (prop === "value_items" && valueItems) return valueItems;

        return [0];
      });
    };

    it("reads quantized parameter with value_items", () => {
      const valueItems = ["Off", "On", "Auto"];

      liveApiGet.mockImplementation((prop) => {
        if (prop === "name") return ["Mode"];
        if (prop === "original_name") return ["Mode"];
        if (prop === "state") return [0]; // active
        if (prop === "automation_state") return [0]; // none
        if (prop === "is_quantized") return [1];
        if (prop === "value") return [1]; // "On"
        if (prop === "value_items") return valueItems;
        if (prop === "is_enabled") return [1];

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
      liveApiGet.mockImplementation((prop) => {
        if (prop === "name") return ["Volume"];
        if (prop === "original_name") return ["Volume"];
        if (prop === "state") return [0]; // active
        if (prop === "automation_state") return [0]; // none
        if (prop === "is_quantized") return [0];
        if (prop === "value") return [0.85];
        if (prop === "min") return [0];
        if (prop === "max") return [1];
        if (prop === "is_enabled") return [1];

        return [0];
      });

      liveApiCall.mockImplementation((method, value) => {
        if (method === "str_for_value") {
          if (value === 0.85) return "0 dB";
          if (value === 0) return "-inf dB";
          if (value === 1) return "6 dB";
        }

        return "";
      });

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
      liveApiGet.mockImplementation((prop) => {
        if (prop === "name") return ["Pan"];
        if (prop === "original_name") return ["Pan"];
        if (prop === "state") return [0];
        if (prop === "automation_state") return [0];
        if (prop === "is_quantized") return [0];
        if (prop === "value") return [0.25];
        if (prop === "min") return [0];
        if (prop === "max") return [1];
        if (prop === "is_enabled") return [1];

        return [0];
      });

      liveApiCall.mockImplementation((method, value) => {
        if (method === "str_for_value") {
          if (value === 0.25) return "25L";
          if (value === 0) return "50L";
          if (value === 1) return "50R";
        }

        return "";
      });

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
      liveApiCall.mockReturnValue("0.5");

      const result = readParameter(createMockParamApi("param_6"));

      expect(result.state).toBe("inactive");
    });

    it("includes automation flag when active", () => {
      setupParamMock({ name: "Filter", automationState: 1 });
      liveApiCall.mockReturnValue("0.5");

      const result = readParameter(createMockParamApi("param_7"));

      expect(result.automation).toBe("active");
    });

    it("includes enabled=false when parameter is disabled", () => {
      setupParamMock({ isEnabled: 0 });
      liveApiCall.mockReturnValue("0.5");

      const result = readParameter(createMockParamApi("param_8"));

      expect(result.enabled).toBe(false);
    });

    it("reads division parameter with enum-like value and options", () => {
      // Division params like Echo's L Division have raw values -6 to 0
      // that map to "1/64" through "1"
      liveApiGet.mockImplementation((prop: string) => {
        if (prop === "name") return ["L Division"];
        if (prop === "original_name") return ["L Division"];
        if (prop === "state") return [0];
        if (prop === "automation_state") return [0];
        if (prop === "is_quantized") return [0];
        if (prop === "value") return [-3]; // corresponds to "1/8"
        if (prop === "min") return [-6];
        if (prop === "max") return [0];
        if (prop === "is_enabled") return [1];

        return [0];
      });

      // Map raw values to division strings
      const divisionMap: Record<string, string | number> = {
        "-6": "1/64",
        "-5": "1/32",
        "-4": "1/16",
        "-3": "1/8",
        "-2": "1/4",
        "-1": "1/2",
        "0": 1, // Note: returns number, not string
      };

      liveApiCall.mockImplementation((method: string, value: number) => {
        if (method === "str_for_value") {
          return divisionMap[String(value)] ?? "";
        }

        return "";
      });

      const result = readParameter(createMockParamApi("param_9"));

      expect(result).toStrictEqual({
        id: "param_9",
        name: "L Division",
        value: "1/8",
        options: ["1/64", "1/32", "1/16", "1/8", "1/4", "1/2", "1"],
      });
    });

    it("handles division param detected via minLabel", () => {
      // Edge case: current value is "1" (not a fraction) but min is "1/64"
      liveApiGet.mockImplementation((prop: string) => {
        if (prop === "name") return ["Division"];
        if (prop === "original_name") return ["Division"];
        if (prop === "state") return [0];
        if (prop === "automation_state") return [0];
        if (prop === "is_quantized") return [0];
        if (prop === "value") return [0]; // corresponds to "1"
        if (prop === "min") return [-2];
        if (prop === "max") return [0];
        if (prop === "is_enabled") return [1];

        return [0];
      });

      const divisionMap: Record<string, string | number> = {
        "-2": "1/4",
        "-1": "1/2",
        "0": 1,
      };

      liveApiCall.mockImplementation((method: string, value: number) => {
        if (method === "str_for_value") {
          return divisionMap[String(value)] ?? "";
        }

        return "";
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
