// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import * as scale from "#src/automation/als-clip-scale.ts";
import {
  clipScaleInternals,
  runClipScale,
} from "../ppal-clip-scale-helpers.ts";
import { parseFlags } from "../clip-patch-cli.ts";

const SRC = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";
const TRACK = "Drums";
const CLIP = "Beat";

/**
 * Das echte e2e-Test-Set in ein frisches Temp-Verzeichnis kopieren.
 * @returns Pfad zur isolierten `.als`-Arbeitskopie.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-scale-"));
  const dst = join(dir, "set.als");

  copyFileSync(SRC, dst);

  return dst;
}

beforeEach(() => {
  // Default: Open-Set-Guard auf "closed", damit Tests robust gegen ein lokal
  // laufendes Producer-Pal auf Port 3350 sind. Tests, die exit 2 erwarten,
  // ueberschreiben das via eigenem vi.spyOn(...).mockReturnValue(true).
  vi.spyOn(clipScaleInternals, "isSetLikelyOpen").mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runClipScale get", () => {
  it("liest Root/Scale des echten MidiClips als JSON (exit 0)", () => {
    const f = tmpCopy();
    let payload = "";
    const w = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        payload += String(chunk);

        return true;
      });
    const code = runClipScale(
      ["get", "--als", f, "--track", TRACK, "--clip", CLIP],
      parseFlags,
    );

    w.mockRestore();

    expect(code).toBe(0);

    const json = JSON.parse(payload) as {
      track: string;
      clip: string;
      scale: scale.ClipScale;
    };

    expect(json.track).toBe(TRACK);
    expect(json.clip).toBe(CLIP);
    expect(json.scale).toStrictEqual({
      root: 9,
      scaleIndex: 1,
      scaleName: "Minor",
    });
  });
});

describe("runClipScale set", () => {
  it("set -> get index-roundtrip-true; nur Clip-Fenster geändert", () => {
    const f = tmpCopy();
    const before = readAls(f);
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const code = runClipScale(
      [
        "set",
        "--als",
        f,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--root",
        "7",
        "--scale",
        "Dorian",
        "--force",
      ],
      parseFlags,
    );

    out.mockRestore();

    expect(code).toBe(0);

    const after = readAls(f);
    const reLoc = scale.getClipScale(
      after.match(/<MidiClip[\S\s]*?<\/MidiClip>/)?.[0] ?? "",
    );

    expect(reLoc.root).toBe(7);
    expect(reLoc.scaleName).toBe("Dorian");
    // Voll-XML: nur die ScaleInformation des Ziel-Clips änderte sich.
    const re = /<ScaleInformation>[\S\s]*?<\/ScaleInformation>/g;

    expect(after.replaceAll(re, "")).toBe(before.replaceAll(re, ""));
  });

  it("Determinismus: Doppellauf identisches Resultat", () => {
    const f = tmpCopy();
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const args = [
      "set",
      "--als",
      f,
      "--track",
      TRACK,
      "--clip",
      CLIP,
      "--root",
      "2",
      "--scale",
      "Lydian",
      "--force",
    ];

    runClipScale(args, parseFlags);
    const a = readAls(f);

    runClipScale(args, parseFlags);
    const b = readAls(f);

    out.mockRestore();

    expect(b).toBe(a);
  });

  it("fehlende Flags -> exit 1", () => {
    expect(runClipScale(["set", "--als", "x", "--force"], parseFlags)).toBe(1);
  });

  it("ungültiger Root -> exit 1", () => {
    const f = tmpCopy();
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runClipScale(
      [
        "set",
        "--als",
        f,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--root",
        "12",
        "--scale",
        "Major",
        "--force",
      ],
      parseFlags,
    );

    err.mockRestore();

    expect(code).toBe(1);
  });

  it("unbekannter Scale -> exit 1", () => {
    const f = tmpCopy();
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runClipScale(
      [
        "set",
        "--als",
        f,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--root",
        "0",
        "--scale",
        "KeineSkala",
        "--force",
      ],
      parseFlags,
    );

    err.mockRestore();

    expect(code).toBe(1);
  });

  it("AudioClip-Ziel -> exit 1 (MidiClip-Guard)", () => {
    const f = tmpCopy();
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runClipScale(
      [
        "set",
        "--als",
        f,
        "--track",
        "Audio 1",
        "--clip",
        "sample",
        "--root",
        "0",
        "--scale",
        "Major",
        "--force",
      ],
      parseFlags,
    );

    err.mockRestore();

    expect(code).toBe(1);
  });

  it("offenes Set ohne --force -> exit 2", () => {
    const f = tmpCopy();
    const spy = vi
      .spyOn(clipScaleInternals, "isSetLikelyOpen")
      .mockReturnValue(true);
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runClipScale(
      [
        "set",
        "--als",
        f,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--root",
        "0",
        "--scale",
        "Major",
      ],
      parseFlags,
    );

    err.mockRestore();
    spy.mockRestore();

    expect(code).toBe(2);
  });

  it("wert-gebundenes Re-Parse-Verify fängt verfälschte Schreibung", () => {
    const f = tmpCopy();
    const real = scale.patchClipScale;
    const spy = vi
      .spyOn(clipScaleInternals, "patchClipScale")
      .mockImplementation((xml: string, _root: number, name: string) =>
        // Falscher Root (3 statt Soll): wert-gebundener Verify MUSS exit 1.
        real(xml, 3, name),
      );
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runClipScale(
      [
        "set",
        "--als",
        f,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--root",
        "0",
        "--scale",
        "Major",
        "--force",
      ],
      parseFlags,
    );

    err.mockRestore();
    spy.mockRestore();

    expect(code).toBe(1);
  });

  it("globales XML außerhalb des Ziel-Clips byte-unverändert", () => {
    const f = tmpCopy();
    const before = readFileSync(SRC);
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    runClipScale(
      [
        "set",
        "--als",
        f,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--root",
        "0",
        "--scale",
        "Major",
        "--force",
      ],
      parseFlags,
    );

    out.mockRestore();

    const afterXml = readAls(f);
    const re = /<ScaleInformation>[\S\s]*?<\/ScaleInformation>/g;
    // Andere Clips (inkl. AudioClip "sample") unverändert: ScaleInfo des
    // Ziel-MidiClips ist der EINZIGE Diff im gesamten Set-XML.
    const beforeXml = readAls(
      (() => {
        const d = mkdtempSync(join(tmpdir(), "ppal-scale-ref-"));
        const p = join(d, "ref.als");

        copyFileSync(SRC, p);

        return p;
      })(),
    );

    expect(afterXml.replaceAll(re, "")).toBe(beforeXml.replaceAll(re, ""));
    expect(before.length).toBeGreaterThan(0);
  });
});
