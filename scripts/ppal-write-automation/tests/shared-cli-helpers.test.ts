// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  parseJsonFile,
  requireAlsCliPrelude,
  requireGetOrSet,
} from "../shared-cli-helpers.ts";

/**
 * Eine Test-Datei mit dem uebergebenen Inhalt schreiben.
 * @param body - Datei-Inhalt (roh oder JSON-serialisierbar).
 * @returns Pfad zur Datei.
 */
function tmpFile(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-sh-"));
  const p = join(dir, "x.json");

  writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body));

  return p;
}

describe("requireGetOrSet", () => {
  it("'get' -> 'get'", () => {
    expect(requireGetOrSet(["get"], "x")).toBe("get");
  });

  it("'set' -> 'set'", () => {
    expect(requireGetOrSet(["set"], "x")).toBe("set");
  });

  it("invalid -> null + stderr message", () => {
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    expect(requireGetOrSet(["foo"], "my-cmd")).toBeNull();
    expect(err).toHaveBeenCalledWith("FEHLER: my-cmd get|set\n");
    err.mockRestore();
  });

  it("undefined arg -> null", () => {
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    expect(requireGetOrSet([], "z")).toBeNull();
    err.mockRestore();
  });
});

describe("parseJsonFile", () => {
  /**
   * Test-Validator: akzeptiert nur `{ ok: true }`.
   * @param d - Unbekannte Daten.
   * @returns Typguard-Resultat.
   */
  function accept(d: unknown): d is { ok: true } {
    return (
      d != null && typeof d === "object" && (d as { ok?: unknown }).ok === true
    );
  }

  it("path undefined -> null", () => {
    expect(parseJsonFile(undefined, accept)).toBeNull();
  });

  it('path === "true" -> null (Flag ohne Wert)', () => {
    expect(parseJsonFile("true", accept)).toBeNull();
  });

  it("path whitespace-only -> null", () => {
    expect(parseJsonFile("   ", accept)).toBeNull();
  });

  it("nonexistent path -> null (readFileSync throws -> JSON.parse catch)", () => {
    expect(parseJsonFile("/no/such/path.json", accept)).toBeNull();
  });

  it("invalid JSON -> null", () => {
    expect(parseJsonFile(tmpFile("{ kaputt"), accept)).toBeNull();
  });

  it("validate rejects -> null", () => {
    expect(parseJsonFile(tmpFile({ ok: false }), accept)).toBeNull();
  });

  it("validate accepts -> data", () => {
    expect(parseJsonFile(tmpFile({ ok: true }), accept)).toStrictEqual({
      ok: true,
    });
  });
});

describe("requireAlsCliPrelude", () => {
  /**
   * Minimaler Test-Flag-Parser: `--key value` Paare.
   * @param argv - Argv.
   * @returns Flag-Map.
   */
  function pf(argv: string[]): Record<string, string> {
    const out: Record<string, string> = {};

    for (let i = 0; i < argv.length; i += 1) {
      const a = argv[i];

      if (a?.startsWith("--")) {
        out[a.slice(2)] = argv[i + 1] ?? "true";
      }
    }

    return out;
  }

  it("Happy: get + --als -> prelude", () => {
    expect(requireAlsCliPrelude(["get", "--als", "/x"], "k", pf)).toStrictEqual(
      { sub: "get", flags: { als: "/x" }, alsPath: "/x" },
    );
  });

  it("invalid sub -> null + stderr", () => {
    const e = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(requireAlsCliPrelude(["nope"], "k", pf)).toBeNull();
    e.mockRestore();
  });

  it("set ohne --als -> null + stderr", () => {
    const e = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    expect(requireAlsCliPrelude(["set"], "k", pf)).toBeNull();
    expect(e).toHaveBeenCalledWith("FEHLER: --als erforderlich\n");
    e.mockRestore();
  });
});
