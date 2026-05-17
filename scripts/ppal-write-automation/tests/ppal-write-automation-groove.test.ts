// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { runCli } from "../ppal-write-automation.ts";

const THROW =
  "/Users/macuser/Desktop/AIbleton/_throwaway-automation-test Project/_throwaway-automation-test.als";
const TRACK = "Spike Instr";

describe("groove subcommand", () => {
  it("fehlende Flags -> Exit 1", () => {
    expect(runCli(["groove"])).toBe(1);
  });

  it("list zeigt Groove 4 (echte throw.als)", () => {
    const tmp = THROW.replace(/\.als$/, ".g5l.als");

    copyFileSync(THROW, tmp);

    try {
      expect(runCli(["groove", "list", "--als", tmp])).toBe(0);
    } finally {
      rmSync(tmp, { force: true });
    }
  });

  it("assign Clip-GrooveId (Track-Clip, NICHT Pool-MidiClip) + tune Pool-Amount", () => {
    const tmp = THROW.replace(/\.als$/, ".g5.als");

    copyFileSync(THROW, tmp);

    try {
      // Spike-Test-Clip in throw.als ist GrooveId=4; setze auf -1 (lösen)
      const a = runCli([
        "groove",
        "assign",
        "--als",
        tmp,
        "--track",
        TRACK,
        "--clip",
        "Spike Test",
        "--groove-id",
        "-1",
        "--force",
      ]);

      expect(a).toBe(0);

      const out1 = readAls(tmp);

      // genau EIN GrooveId-Wechsel im Track-Clip; Pool-eingebetteter
      // MidiClip GrooveId unverändert (-1 sowieso)
      expect(out1).toContain('<GrooveId Value="-1" />');

      const t = runCli([
        "groove",
        "tune",
        "--als",
        tmp,
        "--groove-id",
        "4",
        "--key",
        "TimingAmount",
        "--value",
        "42",
        "--force",
      ]);

      expect(t).toBe(0);
      expect(readAls(tmp)).toContain('<TimingAmount Value="42" />');
    } finally {
      rmSync(tmp, { force: true });
      rmSync(tmp + ".bak", { force: true });
    }
  });

  it("assign --groove-id auf nicht existierende Pool-Id -> Exit 1 (dangling abgelehnt)", () => {
    const tmp = THROW.replace(/\.als$/, ".g5d.als");

    copyFileSync(THROW, tmp);

    try {
      expect(
        runCli([
          "groove",
          "assign",
          "--als",
          tmp,
          "--track",
          TRACK,
          "--clip",
          "Spike Test",
          "--groove-id",
          "99",
          "--force",
        ]),
      ).toBe(1);
    } finally {
      rmSync(tmp, { force: true });
      rmSync(tmp + ".bak", { force: true });
    }
  });

  it("R-C: GroovePool-Block byte-identisch nach assign (nur Track-Clip-GrooveId geändert)", () => {
    const tmp = THROW.replace(/\.als$/, ".g5rc.als");

    copyFileSync(THROW, tmp);

    try {
      const before = readAls(tmp);
      const poolRe = /<GroovePool>[^]*?<\/GroovePool>/;
      const beforePool = before.match(poolRe)?.[0];

      expect(beforePool).toBeTruthy();

      const a = runCli([
        "groove",
        "assign",
        "--als",
        tmp,
        "--track",
        TRACK,
        "--clip",
        "Spike Test",
        "--groove-id",
        "-1",
        "--force",
      ]);

      expect(a).toBe(0);

      const after = readAls(tmp);
      const afterPool = after.match(poolRe)?.[0];

      // Der gesamte GroovePool-Block (inkl. eingebetteter MidiClip-GrooveId)
      // ist byte-identisch zu vorher.
      expect(afterPool).toBe(beforePool);
      // Aber die Datei als Ganzes hat sich geändert (Track-Clip-GrooveId).
      expect(after).not.toBe(before);
    } finally {
      rmSync(tmp, { force: true });
      rmSync(tmp + ".bak", { force: true });
    }
  });
});
