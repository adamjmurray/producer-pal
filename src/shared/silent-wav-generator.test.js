import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { ensureSilenceWav, SILENCE_WAV } from "./silent-wav-generator.js";

describe("silent-wav-generator", () => {
  describe("ensureSilenceWav", () => {
    it("should create and return path to silent WAV file", () => {
      const wavPath = ensureSilenceWav();

      expect(wavPath).toBe(SILENCE_WAV);
      expect(fs.existsSync(wavPath)).toBe(true);
    });

    it("should create a valid WAV file with expected size", () => {
      const wavPath = ensureSilenceWav();
      const stats = fs.statSync(wavPath);

      // Expected: 44 byte header + 8820 byte data = 8864 bytes total
      expect(stats.size).toBe(8864);
    });

    it("should create a file with valid WAV header", () => {
      const wavPath = ensureSilenceWav();
      const buffer = fs.readFileSync(wavPath);

      // Check RIFF header
      expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
      expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");

      // Check fmt chunk
      expect(buffer.toString("ascii", 12, 16)).toBe("fmt ");

      // Check data chunk
      expect(buffer.toString("ascii", 36, 40)).toBe("data");
    });

    it("should return same path on subsequent calls", () => {
      const firstPath = ensureSilenceWav();
      const secondPath = ensureSilenceWav();

      expect(firstPath).toBe(secondPath);
      expect(firstPath).toBe(SILENCE_WAV);
    });

    it("should use caching to avoid recreating file", () => {
      // Call multiple times - all should succeed and return same path
      const firstPath = ensureSilenceWav();
      const secondPath = ensureSilenceWav();
      const thirdPath = ensureSilenceWav();

      expect(firstPath).toBe(SILENCE_WAV);
      expect(secondPath).toBe(SILENCE_WAV);
      expect(thirdPath).toBe(SILENCE_WAV);

      // File should exist
      expect(fs.existsSync(SILENCE_WAV)).toBe(true);
    });
  });
});
