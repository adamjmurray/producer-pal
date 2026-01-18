import { describe, it, expect } from "vitest";
import { parseMaxBoolean } from "./max-input-helpers.js";

describe("max-input-helpers", () => {
  describe("parseMaxBoolean", () => {
    it("should return true for number 1", () => {
      expect(parseMaxBoolean(1)).toBe(true);
    });

    it("should return true for string '1'", () => {
      expect(parseMaxBoolean("1")).toBe(true);
    });

    it("should return true for string 'true'", () => {
      expect(parseMaxBoolean("true")).toBe(true);
    });

    it("should return true for boolean true (loose equality with 1)", () => {
      // true == 1 is true in JavaScript
      expect(parseMaxBoolean(true)).toBe(true);
    });

    it("should return true for array [1] (loose equality with 1)", () => {
      // [1] == 1 is true in JavaScript due to type coercion
      expect(parseMaxBoolean([1])).toBe(true);
    });

    it("should return false for number 0", () => {
      expect(parseMaxBoolean(0)).toBe(false);
    });

    it("should return false for string '0'", () => {
      expect(parseMaxBoolean("0")).toBe(false);
    });

    it("should return false for string 'false'", () => {
      expect(parseMaxBoolean("false")).toBe(false);
    });

    it("should return false for boolean false", () => {
      expect(parseMaxBoolean(false)).toBe(false);
    });

    it("should return false for null", () => {
      expect(parseMaxBoolean(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(parseMaxBoolean(undefined)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(parseMaxBoolean("")).toBe(false);
    });

    it("should return false for array [0]", () => {
      expect(parseMaxBoolean([0])).toBe(false);
    });
  });
});
