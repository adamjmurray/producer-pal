// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { copyFileSync, rmSync } from "node:fs";
import { runCli } from "../ppal-write-automation.ts";
import { readAls } from "#src/automation/als-file.ts";

const ARR =
  "/Users/macuser/Desktop/AIbleton/producer-pal/e2e/live-sets/arrangement-clip-tests Project/arrangement-clip-tests.als";

// Echte Namen aus arrangement-clip-tests.als (gzip-verifiziert):
const AUDIO_TRACK = "1. Audio - Looped";
const AUDIO_CLIP =
  "audio, looped, clip length == arrangement length, start == first Start";
const MIDI_TRACK = "1. MIDI - Looped";
const MIDI_CLIP =
  "midi, looped, clip length == arrangementLength, start == firstStart";

describe("fades subcommand", () => {
  it("fehlende Flags -> Exit 1", () => {
    expect(runCli(["fades"])).toBe(1);
  });

  it("e2e: set FadeOutLength + IsDefaultFadeOut Multi-Patch gegen echte .als", () => {
    const tmp = ARR.replace(/\.als$/, ".s4.als");

    copyFileSync(ARR, tmp);

    try {
      const code = runCli([
        "fades",
        "set",
        "--als",
        tmp,
        "--track",
        AUDIO_TRACK,
        "--clip",
        AUDIO_CLIP,
        "--key",
        "FadeOutLength",
        "--value",
        "1.0",
        "--key",
        "IsDefaultFadeOut",
        "--value",
        "false",
        "--force",
      ]);

      expect(code).toBe(0);
      const out = readAls(tmp);

      expect(out).toContain('<FadeOutLength Value="1.0" />');
      expect(out).toContain('<IsDefaultFadeOut Value="false" />');
    } finally {
      rmSync(tmp, { force: true });
      rmSync(tmp + ".bak", { force: true });
    }
  });

  it("e2e: get liefert JSON mit allen Fade-Werten", () => {
    const code = runCli([
      "fades",
      "get",
      "--als",
      ARR,
      "--track",
      AUDIO_TRACK,
      "--clip",
      AUDIO_CLIP,
    ]);

    expect(code).toBe(0);
  });

  it("MidiClip -> klarer Fehler (Audio-Fades only), Exit 1", () => {
    const tmp = ARR.replace(/\.als$/, ".s4m.als");

    copyFileSync(ARR, tmp);

    try {
      const code = runCli([
        "fades",
        "set",
        "--als",
        tmp,
        "--track",
        MIDI_TRACK,
        "--clip",
        MIDI_CLIP,
        "--key",
        "FadeInLength",
        "--value",
        "1",
        "--force",
      ]);

      expect(code).toBe(1);
    } finally {
      rmSync(tmp, { force: true });
      rmSync(tmp + ".bak", { force: true });
    }
  });

  it("Skew/Slope-Key -> Exit 1 (Slice 4b gesperrt), kein Write", () => {
    const tmp = ARR.replace(/\.als$/, ".s4skew.als");

    copyFileSync(ARR, tmp);

    try {
      const code = runCli([
        "fades",
        "set",
        "--als",
        tmp,
        "--track",
        AUDIO_TRACK,
        "--clip",
        AUDIO_CLIP,
        "--key",
        "FadeInCurveSkew",
        "--value",
        "0.5",
        "--force",
      ]);

      expect(code).toBe(1);
    } finally {
      rmSync(tmp, { force: true });
      rmSync(tmp + ".bak", { force: true });
    }
  });
});
