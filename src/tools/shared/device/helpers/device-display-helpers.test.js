import { beforeEach, describe, expect, it, vi } from "vitest";
import { liveApiCall, liveApiGet } from "#src/test/mock-live-api.js";
import {
  AUTOMATION_STATE_MAP,
  PARAM_STATE_MAP,
  extractMaxPanValue,
  isPanLabel,
  normalizePan,
  parseLabel,
  readParameter,
  readParameterBasic,
} from "./device-display-helpers.js";

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
        expect(parseLabel(null)).toStrictEqual({ value: null, unit: null });
        expect(parseLabel()).toStrictEqual({
          value: null,
          unit: null,
        });
        expect(parseLabel(123)).toStrictEqual({ value: null, unit: null });
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
      expect(isPanLabel(null)).toBe(false);
      expect(isPanLabel()).toBe(false);
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
      liveApiGet.mockImplementation((prop) => {
        if (prop === "name") return ["Volume"];
        if (prop === "original_name") return ["Volume"];

        return [0];
      });

      const mockParamApi = {
        id: "param_1",
        get: liveApiGet,
        getProperty: (prop) => liveApiGet(prop)?.[0],
      };

      const result = readParameterBasic(mockParamApi);

      expect(result).toStrictEqual({
        id: "param_1",
        name: "Volume",
      });
    });

    it("formats name with original_name for rack macros", () => {
      liveApiGet.mockImplementation((prop) => {
        if (prop === "name") return ["Reverb"];
        if (prop === "original_name") return ["Macro 1"];

        return [0];
      });

      const mockParamApi = {
        id: "param_2",
        get: liveApiGet,
        getProperty: (prop) => liveApiGet(prop)?.[0],
      };

      const result = readParameterBasic(mockParamApi);

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

      const mockParamApi = {
        id: "param_3",
        get: liveApiGet,
        getProperty: (prop) => liveApiGet(prop)?.[0],
        call: liveApiCall,
      };

      const result = readParameter(mockParamApi);

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

      const mockParamApi = {
        id: "param_4",
        get: liveApiGet,
        getProperty: (prop) => liveApiGet(prop)?.[0],
        call: liveApiCall,
      };

      const result = readParameter(mockParamApi);

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

      const mockParamApi = {
        id: "param_5",
        get: liveApiGet,
        getProperty: (prop) => liveApiGet(prop)?.[0],
        call: liveApiCall,
      };

      const result = readParameter(mockParamApi);

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
      liveApiGet.mockImplementation((prop) => {
        if (prop === "name") return ["Cutoff"];
        if (prop === "original_name") return ["Cutoff"];
        if (prop === "state") return [1]; // inactive
        if (prop === "automation_state") return [0];
        if (prop === "is_quantized") return [0];
        if (prop === "value") return [0.5];
        if (prop === "min") return [0];
        if (prop === "max") return [1];
        if (prop === "is_enabled") return [1];

        return [0];
      });

      liveApiCall.mockReturnValue("0.5");

      const mockParamApi = {
        id: "param_6",
        get: liveApiGet,
        getProperty: (prop) => liveApiGet(prop)?.[0],
        call: liveApiCall,
      };

      const result = readParameter(mockParamApi);

      expect(result.state).toBe("inactive");
    });

    it("includes automation flag when active", () => {
      liveApiGet.mockImplementation((prop) => {
        if (prop === "name") return ["Filter"];
        if (prop === "original_name") return ["Filter"];
        if (prop === "state") return [0];
        if (prop === "automation_state") return [1]; // active automation
        if (prop === "is_quantized") return [0];
        if (prop === "value") return [0.5];
        if (prop === "min") return [0];
        if (prop === "max") return [1];
        if (prop === "is_enabled") return [1];

        return [0];
      });

      liveApiCall.mockReturnValue("0.5");

      const mockParamApi = {
        id: "param_7",
        get: liveApiGet,
        getProperty: (prop) => liveApiGet(prop)?.[0],
        call: liveApiCall,
      };

      const result = readParameter(mockParamApi);

      expect(result.automation).toBe("active");
    });

    it("includes enabled=false when parameter is disabled", () => {
      liveApiGet.mockImplementation((prop) => {
        if (prop === "name") return ["Param"];
        if (prop === "original_name") return ["Param"];
        if (prop === "state") return [0];
        if (prop === "automation_state") return [0];
        if (prop === "is_quantized") return [0];
        if (prop === "value") return [0.5];
        if (prop === "min") return [0];
        if (prop === "max") return [1];
        if (prop === "is_enabled") return [0]; // disabled

        return [0];
      });

      liveApiCall.mockReturnValue("0.5");

      const mockParamApi = {
        id: "param_8",
        get: liveApiGet,
        getProperty: (prop) => liveApiGet(prop)?.[0],
        call: liveApiCall,
      };

      const result = readParameter(mockParamApi);

      expect(result.enabled).toBe(false);
    });
  });
});
