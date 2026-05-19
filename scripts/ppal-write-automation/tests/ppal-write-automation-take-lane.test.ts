// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import * as tl from "#src/automation/als-takelane.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import { runTakeLane, takeLaneInternals } from "../ppal-take-lane-helpers.ts";
import { parseFlags } from "../clip-patch-cli.ts";

const SRC = "e2e/live-sets/takelane-iso-base Project/takelane-iso-control.als";
const TRACK = "3-Wurli Piano Dmin";

/**
 * Das Kontroll-Fixture (leerer Default-Wrapper) in ein frisches
 * Temp-Verzeichnis kopieren.
 * @returns Pfad zur isolierten `.als`-Arbeitskopie.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-tl-"));
  const dst = join(dir, "set.als");

  copyFileSync(SRC, dst);

  return dst;
}

const CLIP_A =
  '<AudioClip Id="0" Time="10">\n' +
  '\t\t\t\t\t\t\t\t\t\t<TakeId Value="1" />\n' +
  '\t\t\t\t\t\t\t\t\t<Name Value="Take A" />\n' +
  "\t\t\t\t\t\t\t\t\t</AudioClip>";
const CLIP_B =
  '<AudioClip Id="0" Time="10">\n' +
  '\t\t\t\t\t\t\t\t\t\t<TakeId Value="2" />\n' +
  "\t\t\t\t\t\t\t\t\t</AudioClip>";

const SPECS: tl.TakeLaneSpec[] = [
  {
    id: "1",
    takeId: "1",
    height: "51",
    isContentSelected: "false",
    clipXml: CLIP_A,
  },
  {
    id: "0",
    takeId: "2",
    height: "51",
    isContentSelected: "true",
    clipXml: CLIP_B,
  },
];

/**
 * Eine `--lanes-file`-JSON-Datei mit dem Spec-Array schreiben.
 * @param specs - Lane-Spezifikationen (oder beliebiger JSON-Inhalt).
 * @returns Pfad zur Lanes-Datei.
 */
function lanesFile(specs: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-tl-lf-"));
  const p = join(dir, "lanes.json");

  writeFileSync(p, typeof specs === "string" ? specs : JSON.stringify(specs));

  return p;
}

/**
 * Den `<TakeLanes>`-Wrapper des Ziel-Tracks aus der Datei re-locaten.
 * @param f - `.als`-Pfad.
 * @returns Geparste Take-Lanes.
 */
function reGet(f: string): tl.ParsedTakeLanes {
  const trk = locateTrackBlock(readAls(f), TRACK);
  const w = trk.block.match(
    /<TakeLanes>[\S\s]*?<AreTakeLanesFolded Value="\w+" \/>\s*<\/TakeLanes>/,
  );

  return tl.getTakeLanes(w?.[0] ?? "");
}

describe("runTakeLane get", () => {
  it("liest leeren Default als JSON (exit 0)", () => {
    const f = tmpCopy();
    let payload = "";
    const w = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        payload += String(chunk);

        return true;
      });
    const code = runTakeLane(["get", "--als", f, "--track", TRACK], parseFlags);

    w.mockRestore();
    expect(code).toBe(0);

    const json = JSON.parse(payload) as {
      track: string;
      folded: boolean;
      lanes: tl.TakeLaneSpec[];
    };

    expect(json.track).toBe(TRACK);
    expect(json.folded).toBe(true);
    expect(json.lanes).toStrictEqual([]);
  });
});

describe("runTakeLane set", () => {
  it("set -> Datei populiert, JSON written:2 verified:true", () => {
    const f = tmpCopy();
    const lf = lanesFile(SPECS);
    let payload = "";
    const w = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        payload += String(chunk);

        return true;
      });
    const code = runTakeLane(
      ["set", "--als", f, "--track", TRACK, "--lanes-file", lf, "--force"],
      parseFlags,
    );

    w.mockRestore();
    expect(code).toBe(0);

    const json = JSON.parse(payload) as { written: number; verified: boolean };

    expect(json).toMatchObject({ written: 2, verified: true });

    const parsed = reGet(f);

    expect(parsed.folded).toBe(false);
    expect(parsed.lanes).toStrictEqual(SPECS);
  });

  it("fehlende Pflicht-Flags -> exit 1", () => {
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    expect(runTakeLane(["set", "--als", "x", "--force"], parseFlags)).toBe(1);
    err.mockRestore();
  });

  it("fehlende --lanes-file -> exit 1", () => {
    const f = tmpCopy();
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runTakeLane(
      ["set", "--als", f, "--track", TRACK, "--force"],
      parseFlags,
    );

    err.mockRestore();
    expect(code).toBe(1);
  });

  it("--lanes-file JSON-Parse-Fehler -> exit 1", () => {
    const f = tmpCopy();
    const lf = lanesFile("{ kaputt");
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runTakeLane(
      ["set", "--als", f, "--track", TRACK, "--lanes-file", lf, "--force"],
      parseFlags,
    );

    err.mockRestore();
    expect(code).toBe(1);
  });

  it("--lanes-file leeres Array -> exit 1", () => {
    const f = tmpCopy();
    const lf = lanesFile([]);
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runTakeLane(
      ["set", "--als", f, "--track", TRACK, "--lanes-file", lf, "--force"],
      parseFlags,
    );

    err.mockRestore();
    expect(code).toBe(1);
  });

  it("--lanes-file Nicht-Array -> exit 1", () => {
    const f = tmpCopy();
    const lf = lanesFile({ not: "array" });
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runTakeLane(
      ["set", "--als", f, "--track", TRACK, "--lanes-file", lf, "--force"],
      parseFlags,
    );

    err.mockRestore();
    expect(code).toBe(1);
  });

  it("offenes Set ohne --force -> exit 2", () => {
    const f = tmpCopy();
    const lf = lanesFile(SPECS);
    const spy = vi
      .spyOn(takeLaneInternals, "isSetLikelyOpen")
      .mockReturnValue(true);
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runTakeLane(
      ["set", "--als", f, "--track", TRACK, "--lanes-file", lf],
      parseFlags,
    );

    err.mockRestore();
    spy.mockRestore();
    expect(code).toBe(2);
  });

  it("patchTakeLanes-Throw (bereits populiert) -> exit 1, kein Partial", () => {
    const f = tmpCopy();
    const lf = lanesFile(SPECS);
    const o = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const e = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    runTakeLane(
      ["set", "--als", f, "--track", TRACK, "--lanes-file", lf, "--force"],
      parseFlags,
    );
    // Zweiter set auf bereits populiertem Wrapper -> Throw -> exit 1.
    const code = runTakeLane(
      ["set", "--als", f, "--track", TRACK, "--lanes-file", lf, "--force"],
      parseFlags,
    );

    o.mockRestore();
    e.mockRestore();
    expect(code).toBe(1);
  });

  it("wert-gebundenes Re-Parse-Verify faengt verfaelschte Schreibung", () => {
    const f = tmpCopy();
    const lf = lanesFile(SPECS);
    const real = tl.patchTakeLanes;
    // Verfälschte Allokation: falsche TakeId im ersten Clip -> der
    // wert-gebundene Verify MUSS das als Mismatch erkennen (exit 1).
    const spy = vi
      .spyOn(takeLaneInternals, "patchTakeLanes")
      .mockImplementation((w: string, s: tl.TakeLaneSpec[]) =>
        real(
          w,
          s.map((x, i) =>
            i === 0
              ? {
                  ...x,
                  clipXml: x.clipXml.replace(
                    '<TakeId Value="1" />',
                    '<TakeId Value="9" />',
                  ),
                }
              : x,
          ),
        ),
      );
    const e = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const code = runTakeLane(
      ["set", "--als", f, "--track", TRACK, "--lanes-file", lf, "--force"],
      parseFlags,
    );

    e.mockRestore();
    spy.mockRestore();
    expect(code).toBe(1);
  });

  it("bad subcommand -> exit 1", () => {
    const e = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(runTakeLane(["frobnicate"], parseFlags)).toBe(1);
    e.mockRestore();
  });
});
