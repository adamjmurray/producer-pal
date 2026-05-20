// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import * as warp from "#src/automation/als-warp-markers.ts";
import { runWarpMarker, warpInternals } from "../ppal-warp-markers-helpers.ts";
import { parseFlags } from "../clip-patch-cli.ts";

const SRC = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";
const TRACK = "Audio 1";
const CLIP = "sample";

/**
 * Das echte e2e-Test-Set in ein frisches Temp-Verzeichnis kopieren.
 * @returns Pfad zur isolierten `.als`-Arbeitskopie.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-warp-"));
  const dst = join(dir, "set.als");

  copyFileSync(SRC, dst);

  return dst;
}

const M3 = "0:0,1.0:0.5,2.5:1.0830000000000001";

beforeEach(() => {
  // Default: Open-Set-Guard auf "closed", damit Tests robust gegen ein lokal
  // laufendes Producer-Pal auf Port 3350 sind. Tests, die exit 2 erwarten,
  // ueberschreiben das via eigenem vi.spyOn(...).mockReturnValue(true).
  vi.spyOn(warpInternals, "isSetLikelyOpen").mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runWarpMarker get", () => {
  it("liest die echten Marker als JSON-Payload (exit 0)", () => {
    const f = tmpCopy();
    let payload = "";
    const w = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        payload += String(chunk);

        return true;
      });
    const code = runWarpMarker(
      ["get", "--als", f, "--track", TRACK, "--clip", CLIP],
      parseFlags,
    );

    w.mockRestore();

    expect(code).toBe(0);

    const json = JSON.parse(payload) as {
      track: string;
      clip: string;
      warpMarkers: warp.WarpMarker[];
    };

    expect(json.track).toBe(TRACK);
    expect(json.clip).toBe(CLIP);
    // Wert-gebundene Payload-Assertion: exakt die 5 echten Set-Marker.
    expect(json.warpMarkers).toStrictEqual([
      { secTime: "0", beatTime: "0" },
      { secTime: "0.416248944706087587", beatTime: "0.749248147685647736" },
      { secTime: "0.557236464263249687", beatTime: "1.125" },
      { secTime: "1.0820234750699063", beatTime: "1.9476422015484516" },
      { secTime: "1.0993845861810174", beatTime: "1.9788922015484516" },
    ]);
  });
});

describe("runWarpMarker set", () => {
  it("set -> get idempotent, Float-Literal woertlich durchgereicht", () => {
    const f = tmpCopy();
    const out = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const code = runWarpMarker(
      [
        "set",
        "--als",
        f,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--markers",
        M3,
        "--force",
      ],
      parseFlags,
    );

    out.mockRestore();

    expect(code).toBe(0);

    const reLoc = warp.getWarpMarkers(readAls(f));

    expect(reLoc.find((m) => m.beatTime === "2.5")?.secTime).toBe(
      "1.0830000000000001",
    );
    expect(reLoc.length).toBeGreaterThanOrEqual(3);
  });

  it("fehlende Flags -> exit 1", () => {
    expect(runWarpMarker(["set", "--als", "x", "--force"], parseFlags)).toBe(1);
  });

  it("Nicht-AudioClip -> exit 1", () => {
    const f = tmpCopy();
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    // MidiClip "Bassline" auf Track "Bass" -> AudioClip-Guard greift.
    const code = runWarpMarker(
      [
        "set",
        "--als",
        f,
        "--track",
        "Bass",
        "--clip",
        "Bassline",
        "--markers",
        M3,
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
      .spyOn(warpInternals, "isSetLikelyOpen")
      .mockReturnValue(true);
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runWarpMarker(
      ["set", "--als", f, "--track", TRACK, "--clip", CLIP, "--markers", M3],
      parseFlags,
    );

    err.mockRestore();
    spy.mockRestore();

    expect(code).toBe(2);
  });

  it("patchWarpMarkers-Throw -> exit 1 (kein Partial-Write)", () => {
    const f = tmpCopy();
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    // < 2 Marker => patchWarpMarkers wirft.
    const code = runWarpMarker(
      [
        "set",
        "--als",
        f,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--markers",
        "0:0",
        "--force",
      ],
      parseFlags,
    );

    err.mockRestore();

    expect(code).toBe(1);
  });

  it("wert-gebundenes Re-Parse-Verify faengt verfaelschte Schreibung", () => {
    const f = tmpCopy();
    // patchWarpMarkers liefert einen Block mit falschen SecTime-Werten:
    // der wert-gebundene Verify MUSS das als Mismatch erkennen (exit 1),
    // nicht nur Tag-Existenz pruefen.
    const real = warp.patchWarpMarkers;
    const spy = vi
      .spyOn(warpInternals, "patchWarpMarkers")
      .mockImplementation((xml: string, markers: warp.WarpMarker[]) =>
        real(
          xml,
          markers.map((m) => ({ secTime: "999", beatTime: m.beatTime })),
        ),
      );
    const err = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const code = runWarpMarker(
      [
        "set",
        "--als",
        f,
        "--track",
        TRACK,
        "--clip",
        CLIP,
        "--markers",
        M3,
        "--force",
      ],
      parseFlags,
    );

    err.mockRestore();
    spy.mockRestore();

    expect(code).toBe(1);
  });
});
