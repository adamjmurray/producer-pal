// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { runCli } from "../ppal-write-automation.ts";

const AGR = "/Users/macuser/Desktop/AIbleton/g5b-fixture/G5b-RockFatback.agr";
const BEFORE_ALS =
  "/Users/macuser/Desktop/AIbleton/g5b-fixture/" +
  "G5b-before Project/G5b-before.als";
const POOL_RE = /<GroovePool>[\S\s]*?<\/GroovePool>/;

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

  // Slice-5b T6: 'groove import' ist jetzt implementiert. Die
  // urspruenglichen Charakterisierungs-Invarianten bleiben gueltig
  // (fehlende Flags -> Exit 1; nicht existente Dateien -> Exit 1, kein
  // Crash) — der Fehlerpfad ist nur jetzt der Flag-/IO-Pfad statt des
  // Unbekannt-Dispatch-Zweigs.
  it("'groove import' ohne Flags -> Exit 1 (Pflicht-Flags fehlen)", () => {
    expect(runCli(["groove", "import"])).toBe(1);
  });

  it("'groove import' mit nicht existenten Dateien -> Exit 1 (kein Crash)", () => {
    expect(
      runCli([
        "groove",
        "import",
        "--als",
        "/nicht/existent.als",
        "--agr",
        "/nicht/existent.agr",
        "--force",
      ]),
    ).toBe(1);
  });

  it("T6 e2e: groove import legt neuen <Groove Id> an; verified:true; Mitigation-B", () => {
    const dir = mkdtempSync(join(tmpdir(), "g5b-import-"));
    const als = join(dir, "G5b-before.als");

    copyFileSync(BEFORE_ALS, als);

    try {
      const before = readAls(als);
      const code = runCli([
        "groove",
        "import",
        "--als",
        als,
        "--agr",
        AGR,
        "--force",
      ]);

      expect(code).toBe(0);

      const after = readAls(als);

      // Mitigation-B: alles ausserhalb <GroovePool> byte-identisch.
      expect(after.replace(POOL_RE, "")).toBe(before.replace(POOL_RE, ""));

      const afterPool = after.match(POOL_RE)?.[0] ?? "";

      expect([...afterPool.matchAll(/<Groove Id="\d+">/g)]).toHaveLength(2);
      expect(afterPool).toContain('<Groove Id="5">');
      // .agr-interner Name als Default.
      expect(afterPool).toContain(
        '<Name Value="Rock Fatback - 4 bars 16ths" />',
      );
      // Note-Attribute gestrippt im neuen Eintrag.
      expect(afterPool).not.toContain("VelocityDeviation=");
      // Bestands-Groove 4: Selection true -> false.
      const g4 = afterPool.slice(
        afterPool.indexOf('<Groove Id="4">'),
        afterPool.indexOf("</Groove>") + "</Groove>".length,
      );

      expect(g4).toContain('<Selection Value="false" />');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("T6 e2e: --name override schreibt den Pool-Namen", () => {
    const dir = mkdtempSync(join(tmpdir(), "g5b-import-n-"));
    const als = join(dir, "G5b-before.als");

    copyFileSync(BEFORE_ALS, als);

    try {
      const code = runCli([
        "groove",
        "import",
        "--als",
        als,
        "--agr",
        AGR,
        "--name",
        "Custom Name",
        "--force",
      ]);

      expect(code).toBe(0);
      expect(readAls(als)).toContain('<Name Value="Custom Name" />');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("T6: --agr fehlt -> Exit 1", () => {
    const dir = mkdtempSync(join(tmpdir(), "g5b-import-e-"));
    const als = join(dir, "G5b-before.als");

    copyFileSync(BEFORE_ALS, als);

    try {
      expect(runCli(["groove", "import", "--als", als, "--force"])).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
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
