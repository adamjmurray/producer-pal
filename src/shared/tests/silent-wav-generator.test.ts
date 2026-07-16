// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

interface WavModule {
  ensureSilenceWav: () => string;
  SILENCE_WAV: string;
}

// Reset the module registry so the module-level `silenceWavGenerated` flag
// starts cold, then re-import. The two-level cache (in-memory flag + on-disk
// file) otherwise makes `createSilentWav` run at most once across the whole
// file, which hides every byte-layout assertion from the code that produced it.
async function loadFresh(): Promise<WavModule> {
  vi.resetModules();

  return await import("#src/shared/silent-wav-generator.ts");
}

describe("silent-wav-generator", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createSilentWav byte layout", () => {
    // Force createSilentWav to run under the assertions (cold flag + no file),
    // then read back the bytes it wrote.
    async function freshWavBuffer(): Promise<Buffer> {
      const { ensureSilenceWav, SILENCE_WAV } = await loadFresh();

      if (fs.existsSync(SILENCE_WAV)) fs.unlinkSync(SILENCE_WAV);

      return fs.readFileSync(ensureSilenceWav());
    }

    it("writes an 8864-byte file with RIFF/WAVE/fmt/data chunks", async () => {
      const buffer = await freshWavBuffer();

      // 44-byte header + 8820-byte data (4410 mono 16-bit samples).
      expect(buffer).toHaveLength(8864);
      expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
      expect(buffer.readUInt32LE(4)).toBe(8856); // 36 + dataSize
      expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");
      expect(buffer.toString("ascii", 12, 16)).toBe("fmt ");
      expect(buffer.toString("ascii", 36, 40)).toBe("data");
      expect(buffer.readUInt32LE(40)).toBe(8820); // dataSize
      // Payload is silence (all zero bytes).
      expect(buffer.subarray(44).every((byte) => byte === 0)).toBe(true);
    });

    it("encodes the PCM fmt fields (rate, channels, byte/block sizes)", async () => {
      const buffer = await freshWavBuffer();

      expect(buffer.readUInt32LE(16)).toBe(16); // PCM header size
      expect(buffer.readUInt16LE(20)).toBe(1); // audio format PCM
      expect(buffer.readUInt16LE(22)).toBe(1); // channels (mono)
      expect(buffer.readUInt32LE(24)).toBe(44100); // sample rate
      expect(buffer.readUInt32LE(28)).toBe(88200); // byte rate = 44100*1*16/8
      expect(buffer.readUInt16LE(32)).toBe(2); // block align = 1*16/8
      expect(buffer.readUInt16LE(34)).toBe(16); // bits per sample
    });
  });

  describe("ensureSilenceWav two-level caching", () => {
    it("creates the file when neither the flag nor the file is present", async () => {
      const { ensureSilenceWav, SILENCE_WAV } = await loadFresh();

      if (fs.existsSync(SILENCE_WAV)) fs.unlinkSync(SILENCE_WAV);

      const writeSpy = vi.spyOn(fs, "writeFileSync");
      const wavPath = ensureSilenceWav();

      expect(writeSpy).toHaveBeenCalledTimes(1);
      expect(wavPath).toBe(SILENCE_WAV);
      expect(fs.existsSync(wavPath)).toBe(true);
    });

    it("skips all filesystem access once the in-memory flag is warm", async () => {
      const { ensureSilenceWav, SILENCE_WAV } = await loadFresh();

      ensureSilenceWav(); // warms the in-memory flag (and writes the file)

      const existsSpy = vi.spyOn(fs, "existsSync");
      const writeSpy = vi.spyOn(fs, "writeFileSync");
      const secondPath = ensureSilenceWav();

      // The flag short-circuits before any fs access on the second call.
      expect(existsSpy).not.toHaveBeenCalled();
      expect(writeSpy).not.toHaveBeenCalled();
      expect(secondPath).toBe(SILENCE_WAV);
    });

    it("does not rewrite the file when it exists on disk but the flag is cold", async () => {
      const warm = await loadFresh();

      warm.ensureSilenceWav(); // ensure the file exists on disk

      // Fresh module → flag cold again, but the file survives on disk.
      const { ensureSilenceWav, SILENCE_WAV } = await loadFresh();

      expect(fs.existsSync(SILENCE_WAV)).toBe(true);

      const writeSpy = vi.spyOn(fs, "writeFileSync");

      ensureSilenceWav();

      // File already present → the existsSync guard skips createSilentWav.
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });
});
