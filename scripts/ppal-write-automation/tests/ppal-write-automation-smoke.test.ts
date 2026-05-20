// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { DISPATCH, runCli } from "../ppal-write-automation.ts";

/**
 * Dispatch-Smoke-Test (Item 4 Phase 4b der CLI-Finalisierung).
 *
 * Beweist: jeder in der DISPATCH-Map registrierte Subcommand
 *   (a) ist von `runCli` erreichbar (nicht "Unbekanntes Subcommand"),
 *   (b) produziert bei Aufruf ohne/mit ungueltigen Args einen erkennbaren
 *       Klartext-Fehler auf stderr und Exit-Code 1,
 *   (c) crasht nicht unkontrolliert (kein uncaught throw).
 *
 * Das ist KEIN Happy-Path-Test (echte writes pro Subcommand werden in den
 * jeweiligen `tests/ppal-write-automation-<feature>.test.ts` abgedeckt).
 * Smoke-Test garantiert nur die Dispatch-Konsistenz: wer einen Subcommand
 * in die DISPATCH-Map einbaut, kriegt automatisch ein Smoke-Cover.
 */

/**
 * Einen runCli-Aufruf mit stummgeschaltetem stderr ausfuehren und Exit-Code
 * + stderr-Payload zurueckgeben.
 * @param argv - Argument-Array fuer runCli.
 * @returns Exit-Code + gesammelter stderr-Output.
 */
function runWithStderr(argv: string[]): { code: number; err: string } {
  let err = "";
  const w = vi
    .spyOn(process.stderr, "write")
    .mockImplementation((c: string | Uint8Array) => {
      err += String(c);

      return true;
    });

  try {
    return { code: runCli(argv), err };
  } finally {
    w.mockRestore();
  }
}

// Subcommand-Inventar, das den DISPATCH-Map-Eintraegen entspricht.
// Reihenfolge konsistent mit dem README-Bereich (CLI-Hilfe sortiert
// alphabetisch zur Anzeige, hier funktional gruppiert fuer Lesbarkeit).
//
// Codex-Final-Pass Strenge: hintRegex enthaelt NUR subcommand-spezifische
// Tokens oder Pflicht-Flag-Namen. Kein generisches `|fehler` mehr — das
// haette jede Stub-Implementation mit "FEHLER: boom" akzeptiert und damit
// die Subcommand-Spezifitaet nicht bewiesen.
const SUBCOMMANDS: { name: string; args: string[]; hintRegex: RegExp }[] = [
  // Automation
  { name: "list", args: [], hintRegex: /--als|--track/i },
  { name: "write", args: [], hintRegex: /--als|--track/i },
  // Transport
  {
    name: "arrangement-loop",
    args: [],
    hintRegex: /arrangement-loop|get\|set/i,
  },
  // Clip-Eigenschaften
  { name: "clip-settings", args: [], hintRegex: /clip-settings|--als/i },
  { name: "clip-flags", args: [], hintRegex: /clip-flags|--als/i },
  { name: "clip-scale", args: [], hintRegex: /clip-scale|--als/i },
  // Fades
  { name: "fades", args: [], hintRegex: /fades|get\|set/i },
  { name: "fadeout-curve", args: [], hintRegex: /fadeout-curve|get\|set/i },
  // Groove
  {
    name: "groove",
    args: [],
    hintRegex: /groove|list\|assign\|tune\|import/i,
  },
  // Tempo + Timesig
  { name: "tempo", args: [], hintRegex: /tempo|--als/i },
  { name: "timesig", args: [], hintRegex: /timesig|list\|write/i },
  // Mixer + Routing
  {
    name: "mixer-routing",
    args: [],
    hintRegex: /mixer-routing|crossfade\|send-pre/i,
  },
  { name: "track-group", args: [], hintRegex: /track-group|set\|fold/i },
  { name: "routing", args: [], hintRegex: /routing|--als|--track/i },
  // Modulation + Warp
  { name: "modulation", args: [], hintRegex: /modulation|write\|get/i },
  { name: "warp-marker", args: [], hintRegex: /warp-marker|--als/i },
  // Arrangement-Zeit + Take-Lanes
  { name: "shift-time", args: [], hintRegex: /shift-time|--als/i },
  { name: "take-lane", args: [], hintRegex: /take-lane|--als/i },
  // Export + Group-Creation
  { name: "midi-export", args: [], hintRegex: /midi-export|--als/i },
  {
    name: "group-create",
    args: [],
    hintRegex: /group-create|--als|--group-spec-file/i,
  },
];

describe("DISPATCH-Smoke (Item 4 Phase 4b)", () => {
  it.each(SUBCOMMANDS)(
    "$name ist dispatchable und liefert Klartext-Fehler bei leeren Args",
    ({ name, args, hintRegex }) => {
      const { code, err } = runWithStderr([name, ...args]);

      // Subcommand wurde erreicht (kein "Unbekanntes Subcommand"-Fallback).
      expect(err).not.toContain("Unbekanntes Subcommand");
      // Erkennbarer Klartext-Fehler statt unkontrolliertem Crash.
      expect(err).toMatch(hintRegex);
      // Exit 1 (oder 2 fuer Open-Set-Guard) — niemals 0 bei leeren Args.
      expect(code).toBeGreaterThan(0);
      expect(code).toBeLessThanOrEqual(2);
    },
  );

  it("FEHLER-Meldung bei unbekanntem Subcommand listet alle bekannten", () => {
    const { code, err } = runWithStderr(["definitiv-nicht-existent"]);

    expect(code).toBe(1);
    expect(err).toContain('Unbekanntes Subcommand "definitiv-nicht-existent"');
    expect(err).toContain("Verfuegbar:");
    // Stichprobe: 3 reale Subcommands muessen im Hint stehen.
    expect(err).toContain("arrangement-loop");
    expect(err).toContain("clip-settings");
    expect(err).toContain("group-create");
  });

  it("DISPATCH-Map vs. SUBCOMMANDS Inventar (Codex-Final-Pass: gegen Production statt Soll-Liste)", () => {
    // Codex-Stage-2 fand: Vergleich gegen hartcodierte Soll-Liste beweist
    // NICHT die Dispatch-Coverage — wer DISPATCH erweitert ohne SUBCOMMANDS
    // anzupassen, bleibt unbemerkt. Fix: gegen die echte exportierte
    // DISPATCH-Map vergleichen.
    expect(SUBCOMMANDS.map((s) => s.name).sort()).toStrictEqual(
      Object.keys(DISPATCH).sort(),
    );
  });
});
