// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import { getTrackRouting } from "#src/automation/als-routing.ts";
import { routingInternals, runRouting } from "../ppal-routing-helpers.ts";
import { parseFlags } from "../clip-patch-cli.ts";

const SRC = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";
const MIDI_TRACK = "Drums";
const AUDIO_TRACK = "Audio 1";

/**
 * Ein echtes Test-Set in ein frisches Temp-Verzeichnis kopieren.
 * @returns Pfad zur isolierten `.als`-Arbeitskopie.
 */
function tmpCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "ppal-routing-"));
  const dst = join(dir, "set.als");

  copyFileSync(SRC, dst);

  return dst;
}

/**
 * stdout fuer den Aufruf abfangen.
 * @param fn - Auszufuehrender Aufruf, liefert den Exit-Code.
 * @returns Exit-Code + gesammelte stdout-Payload.
 */
function captureOut(fn: () => number): { code: number; out: string } {
  let out = "";
  const w = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      out += String(chunk);

      return true;
    });

  try {
    return { code: fn(), out };
  } finally {
    w.mockRestore();
  }
}

/**
 * stderr stummschalten (Guard-Pfade schreiben FEHLER-Zeilen).
 * @returns Restore-Funktion fuer den Spy.
 */
function muteErr(): () => void {
  const w = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  return () => w.mockRestore();
}

beforeEach(() => {
  // Default: Open-Set-Guard auf "closed", damit Tests robust gegen ein lokal
  // laufendes Producer-Pal auf Port 3350 sind. Tests, die exit 2 erwarten,
  // ueberschreiben das via eigenem vi.spyOn(...).mockReturnValue(true).
  vi.spyOn(routingInternals, "isSetLikelyOpen").mockReturnValue(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runRouting Flag-/Guard-Exit-Codes", () => {
  it("exit 1 bei fehlendem --track", () => {
    const restore = muteErr();
    const code = runRouting(["get", "--als", SRC], parseFlags);

    restore();
    expect(code).toBe(1);
  });

  it("exit 1 bei unbekanntem Subcommand", () => {
    const restore = muteErr();
    const code = runRouting(["bogus"], parseFlags);

    restore();
    expect(code).toBe(1);
  });

  it("exit 1 bei set ohne --kind/--target", () => {
    const restore = muteErr();
    const code = runRouting(
      ["set", "--als", tmpCopy(), "--track", MIDI_TRACK],
      parseFlags,
    );

    restore();
    expect(code).toBe(1);
  });

  it("exit 1 bei bad-kind", () => {
    const restore = muteErr();
    const code = runRouting(
      [
        "set",
        "--als",
        tmpCopy(),
        "--track",
        MIDI_TRACK,
        "--kind",
        "bogus",
        "--target",
        "none",
      ],
      parseFlags,
    );

    restore();
    expect(code).toBe(1);
  });

  it("exit 1 bei kind-fremdem/inkonsistentem target (R4)", () => {
    const restore = muteErr();
    const code = runRouting(
      [
        "set",
        "--als",
        tmpCopy(),
        "--track",
        MIDI_TRACK,
        "--kind",
        "midi-in",
        "--target",
        "main",
      ],
      parseFlags,
    );

    restore();
    expect(code).toBe(1);
  });

  it("exit 2 bei offenem Set ohne --force (Spy-Seam)", () => {
    const spy = vi
      .spyOn(routingInternals, "isSetLikelyOpen")
      .mockReturnValue(true);
    const restore = muteErr();
    const code = runRouting(
      [
        "set",
        "--als",
        tmpCopy(),
        "--track",
        MIDI_TRACK,
        "--kind",
        "audio-out",
        "--target",
        "none",
      ],
      parseFlags,
    );

    restore();
    spy.mockRestore();
    expect(code).toBe(2);
  });

  it("exit 1 bei wert-gebundenem Verify-Mismatch (Spy verfaelscht Output)", () => {
    const f = tmpCopy();
    const real = routingInternals.patchTrackRouting;
    const spy = vi
      .spyOn(routingInternals, "patchTrackRouting")
      .mockImplementation((b: string, kind, key: string) => {
        const res = real(b, kind, key);

        // Strukturvalide, aber falscher Target-Wert -> Re-Parse-Verify
        // muss anschlagen (NICHT nur Tag-Existenz).
        return res.replace(
          '<Target Value="AudioOut/None" />',
          '<Target Value="AudioOut/Wrong" />',
        );
      });
    const restore = muteErr();
    const code = runRouting(
      [
        "set",
        "--als",
        f,
        "--track",
        MIDI_TRACK,
        "--kind",
        "audio-out",
        "--target",
        "none",
      ],
      parseFlags,
    );

    restore();
    spy.mockRestore();
    expect(code).toBe(1);
  });
});

describe("runRouting Window-Guard-Migration (Slice ppal-window-guard)", () => {
  // Strukturelle Charakterisierung (NICHT Staerkungs-Beweis):
  // lean-track-cli baut updated als
  // xml.slice(0, loc.start) + newBlock + xml.slice(loc.end), d.h. der
  // Apply-Pfad ist STRUKTURELL auf das Track-Fenster eingegrenzt. Diese
  // Invariante bedeutet: jede Spy-Mutation am Block-Output landet
  // INNERHALB von [loc.start, loc.start+|newBlock|) -> Guard mit Range =
  // ganzes Track-Fenster bleibt gruen, Prefix/Suffix unveraendert.
  // Aufruf-seitig vereinbart, dass kein verdeckter Out-of-Window-Defekt
  // existieren KANN (Mitigation R2 der Premortem dokumentiert). Der
  // eigentliche Staerkungs-Beweis (Gap-Mutation in Multi-Range) liegt in
  // window-guard.test.ts (Differenzial-Test).
  it("Block-Apply strukturell aufs Track-Fenster eingegrenzt (Charakterisierung)", () => {
    const f = tmpCopy();
    const before = readAls(f);
    const realPatch = routingInternals.patchTrackRouting;

    vi.spyOn(routingInternals, "patchTrackRouting").mockImplementation(
      (block: string, kind, target) => {
        // Strukturvalide Variante (echte Routing-Aenderung), aber wir
        // koennen NICHTS ausserhalb des Blocks aendern — das beweist:
        return realPatch(block, kind, target); // Identitaet zur echten Patch-Logik
      },
    );

    const r = captureOut(() =>
      runRouting(
        [
          "set",
          "--als",
          f,
          "--track",
          MIDI_TRACK,
          "--kind",
          "audio-out",
          "--target",
          "none",
        ],
        parseFlags,
      ),
    );

    expect(r.code).toBe(0);

    // Charakterisierung: Prefix vor Track + Suffix nach Track
    // garantiert byte-identisch zu before (Out-of-Window-Defekt ist
    // strukturell ausgeschlossen).
    const after = readAls(f);
    const tBefore = locateTrackBlock(before, MIDI_TRACK);
    const delta = after.length - before.length;

    expect(after.slice(0, tBefore.index)).toBe(before.slice(0, tBefore.index));
    expect(after.slice(tBefore.end + delta)).toBe(before.slice(tBefore.end));
  });
});

describe.each([
  ["MIDI", MIDI_TRACK],
  ["Audio", AUDIO_TRACK],
])("runRouting get+set Erfolg (%s-Track)", (_label, track) => {
  it("get liefert die 4 Routings als JSON (exit 0)", () => {
    const r = captureOut(() =>
      runRouting(["get", "--als", tmpCopy(), "--track", track], parseFlags),
    );

    expect(r.code).toBe(0);

    const json = JSON.parse(r.out) as {
      track: string;
      routing: Record<string, { target: string }>;
    };

    expect(json.track).toBe(track);
    expect(json.routing["midi-out"]?.target).toBe("MidiOut/None");
  });

  it("set schreibt das Tripel, exit 0, verified:true, Voll-XML nur Fenster", () => {
    const f = tmpCopy();
    const before = readAls(f);
    const r = captureOut(() =>
      runRouting(
        [
          "set",
          "--als",
          f,
          "--track",
          track,
          "--kind",
          "audio-out",
          "--target",
          "none",
        ],
        parseFlags,
      ),
    );

    expect(r.code).toBe(0);

    const json = JSON.parse(r.out) as {
      track: string;
      kind: string;
      target: string;
      verified: boolean;
    };

    expect(json.kind).toBe("audio-out");
    expect(json.target).toBe("none");
    expect(json.verified).toBe(true);

    const after = readAls(f);
    const t = locateTrackBlock(after, track);

    expect(getTrackRouting(t.block)["audio-out"]).toStrictEqual({
      target: "AudioOut/None",
      upper: "No Output",
      lower: "",
    });

    // Voll-XML: NUR das [tBefore.index, tBefore.end)-Fenster darf
    // differieren. Laenge kann sich aendern (ext-stereo -> none), daher
    // Suffix-Vergleich um delta versetzt (isOnlyWindowChanged-Semantik).
    const tBefore = locateTrackBlock(before, track);
    const delta = after.length - before.length;

    expect(after.slice(0, tBefore.index)).toBe(before.slice(0, tBefore.index));
    expect(after.slice(tBefore.end + delta)).toBe(before.slice(tBefore.end));
  });

  it("ist deterministisch (Doppellauf gleiche Bytes)", () => {
    const f1 = tmpCopy();
    const f2 = tmpCopy();

    for (const f of [f1, f2]) {
      const restore = muteErr();

      runRouting(
        [
          "set",
          "--als",
          f,
          "--track",
          track,
          "--kind",
          "midi-out",
          "--target",
          "none",
        ],
        parseFlags,
      );
      restore();
    }

    expect(readAls(f1)).toBe(readAls(f2));
  });
});
