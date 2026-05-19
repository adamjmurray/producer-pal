// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { getArrangementLoop } from "#src/automation/als-arrangement-loop.ts";
import { parseFlags } from "../clip-patch-cli.ts";
import {
  arrLoopInternals,
  runArrangementLoop,
} from "../ppal-arrangement-loop-helpers.ts";

const SRC = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";

/**
 * Das echte e2e-Test-Set in ein frisches Temp-Verzeichnis kopieren.
 * @returns Pfad zur isolierten `.als`-Arbeitskopie.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-arrloop-"));
  const dst = join(dir, "set.als");

  copyFileSync(SRC, dst);

  return dst;
}

/**
 * `runArrangementLoop` mit unterdruecktem stdout/stderr ausfuehren und den
 * gesammelten stdout zurueckgeben.
 * @param argv - Argument-Array ohne das `arrangement-loop`-Token.
 * @returns `{ code, out }`.
 */
function run(argv: string[]): { code: number; out: string } {
  let out = "";
  const w = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((c: string | Uint8Array) => {
      out += String(c);

      return true;
    });
  const e = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const code = runArrangementLoop(argv, parseFlags);

  w.mockRestore();
  e.mockRestore();

  return { code, out };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runArrangementLoop guards", () => {
  it("exit 1 bei fehlendem Subcommand", () => {
    expect(run([]).code).toBe(1);
  });

  it("exit 1 bei unbekanntem Subcommand", () => {
    expect(run(["foo", "--als", "x"]).code).toBe(1);
  });

  it("exit 1 bei fehlendem --als", () => {
    expect(run(["get"]).code).toBe(1);
  });

  it("exit 1 bei keinem Feld (set)", () => {
    expect(run(["set", "--als", tmpCopy()]).code).toBe(1);
  });

  it("exit 1 bei ungueltigem --on", () => {
    expect(run(["set", "--als", tmpCopy(), "--on", "yes"]).code).toBe(1);
  });

  it("exit 1 bei nicht-numerischem --start", () => {
    expect(run(["set", "--als", tmpCopy(), "--start", "x"]).code).toBe(1);
  });

  it("exit 1 bei negativem --start", () => {
    expect(run(["set", "--als", tmpCopy(), "--start", "-1"]).code).toBe(1);
  });

  it("exit 2 bei offenem Set ohne --force", () => {
    vi.spyOn(arrLoopInternals, "isSetLikelyOpen").mockReturnValue(true);

    expect(run(["set", "--als", tmpCopy(), "--on", "false"]).code).toBe(2);
  });

  it("exit 1 wenn patchArrangementLoop wirft (kein Partial)", () => {
    vi.spyOn(arrLoopInternals, "patchArrangementLoop").mockImplementation(
      () => {
        throw new Error("boom");
      },
    );

    expect(
      run(["set", "--als", tmpCopy(), "--on", "false", "--force"]).code,
    ).toBe(1);
  });

  it("exit 1 bei wert-gebundenem Verify-Mismatch", () => {
    const f = tmpCopy();

    vi.spyOn(arrLoopInternals, "patchArrangementLoop").mockImplementation(
      (xml: string) =>
        xml.replace(
          /(<Transport>[\S\s]*?<LoopStart Value=")[^"]*(")/,
          "$199$2",
        ),
    );

    // Soll LoopStart=4 setzen, der Spy schreibt aber 99 -> Mismatch.
    expect(run(["set", "--als", f, "--start", "4", "--force"]).code).toBe(1);
  });
});

describe("runArrangementLoop get/set", () => {
  it("get liefert exit 0 + JSON", () => {
    const r = run(["get", "--als", tmpCopy()]);

    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toStrictEqual({
      arrangementLoop: { on: true, start: "32", length: "32" },
    });
  });

  it("set --on false einzeln (exit 0, verified)", () => {
    const f = tmpCopy();
    const r = run(["set", "--als", f, "--on", "false", "--force"]);

    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toStrictEqual({
      arrangementLoop: { on: false, start: "32", length: "32" },
      verified: true,
    });
    expect(getArrangementLoop(readAls(f))).toStrictEqual({
      on: false,
      start: "32",
      length: "32",
    });
  });

  it("set --start einzeln (ungepatchte Felder unveraendert)", () => {
    const f = tmpCopy();

    expect(run(["set", "--als", f, "--start", "16", "--force"]).code).toBe(0);
    expect(getArrangementLoop(readAls(f))).toStrictEqual({
      on: true,
      start: "16",
      length: "32",
    });
  });

  it("set --length einzeln", () => {
    const f = tmpCopy();

    expect(run(["set", "--als", f, "--length", "8", "--force"]).code).toBe(0);
    expect(getArrangementLoop(readAls(f))).toStrictEqual({
      on: true,
      start: "32",
      length: "8",
    });
  });

  it("set kombiniert + Float woertlich, nur Transport-Fenster geaendert", () => {
    const f = tmpCopy();
    const before = readAls(f);
    const clipLoop = before.match(
      /<Loop>[\S\s]*?<LoopEnd Value="[^"]*"[\S\s]*?<\/Loop>/,
    );

    if (clipLoop == null) throw new Error("Test-Setup: kein Clip-<Loop>");

    expect(
      run([
        "set",
        "--als",
        f,
        "--on",
        "false",
        "--start",
        "4.5",
        "--length",
        "2",
        "--force",
      ]).code,
    ).toBe(0);

    const after = readAls(f);

    expect(getArrangementLoop(after)).toStrictEqual({
      on: false,
      start: "4.5",
      length: "2",
    });
    expect(after).toContain(clipLoop[0]);
    expect(after).toContain('<LoopStart Value="4.5" />');
  });

  it("Doppellauf deterministisch (idempotent gleicher Wert)", () => {
    const f = tmpCopy();

    expect(run(["set", "--als", f, "--length", "7", "--force"]).code).toBe(0);
    const first = readAls(f);

    expect(run(["set", "--als", f, "--length", "7", "--force"]).code).toBe(0);

    expect(readAls(f)).toBe(first);
  });
});
