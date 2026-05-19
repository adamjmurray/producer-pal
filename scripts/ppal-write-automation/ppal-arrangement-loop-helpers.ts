// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ArrLoop,
  type ArrLoopPatch,
  getArrangementLoop,
  patchArrangementLoop,
} from "#src/automation/als-arrangement-loop.ts";
import {
  backupAls,
  isSetLikelyOpen,
  readAls,
  writeAls,
} from "#src/automation/als-file.ts";
import { isOnlyWindowChanged } from "./clip-patch-cli.ts";
import { requireAlsCliPrelude } from "./shared-cli-helpers.ts";

/** Spy-Seam fuer Tests (open-set-Guard + Patch-Funktion stubbar). */
export const arrLoopInternals = { isSetLikelyOpen, patchArrangementLoop };

/**
 * Run the `arrangement-loop get|set` subcommand (offline byte-true
 * Setzen der set-globalen Arrangement-Loop-Region im eindeutigen
 * `<Transport>`-Block). Lean set-globaler Pfad analog
 * `ppal-mixer-routing-helpers.ts` `applySendPre` (KEIN `locateTrackBlock`/
 * `runLeanTrackCli` — set-global, nicht track/clip-scoped): readAls →
 * patch whole-xml → `isOnlyWindowChanged` auf dem `<Transport>`-Fenster →
 * backup → write → wert-gebundenes Re-Parse-Verify. Open-Set-Guard
 * (exit 2 ohne `--force`).
 * @param rest - Argument-Array ohne das `arrangement-loop`-Token.
 * @param parseFlags - Geteilte Flag-Parser-Funktion.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runArrangementLoop(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  const pre = requireAlsCliPrelude(rest, "arrangement-loop", parseFlags);

  if (pre == null) return 1;
  const { sub, flags, alsPath } = pre;

  if (sub === "get") {
    const arrangementLoop = getArrangementLoop(readAls(alsPath));

    process.stdout.write(JSON.stringify({ arrangementLoop }));

    return 0;
  }

  return runSet(alsPath, flags);
}

/**
 * Den `set`-Pfad ausfuehren: Patch aus Flags bauen + haerten, Open-Set-Guard,
 * atomar im `<Transport>`-Fenster patchen, backup + write, wert-gebundenes
 * Re-Parse-Verify (gepatchte Felder == Soll, ungepatchte == vorher).
 * @param alsPath - Pfad zur `.als`-Datei.
 * @param flags - Geparste Flag-Map.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
function runSet(alsPath: string, flags: Record<string, string>): number {
  const patch = buildPatch(flags);

  if (patch == null) return 1;

  if (Object.keys(patch).length === 0) {
    process.stderr.write(
      "FEHLER: mindestens --on|--start|--length erforderlich\n",
    );

    return 1;
  }

  if (arrLoopInternals.isSetLikelyOpen() && flags.force !== "true") {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n",
    );

    return 2;
  }

  const xml = readAls(alsPath);
  const before = getArrangementLoop(xml);
  const result = patchWithinTransport(xml, patch);

  if ("error" in result) {
    process.stderr.write(`FEHLER: ${result.error}\n`);

    return 1;
  }

  backupAls(alsPath);
  writeAls(alsPath, result.xml);

  return verify(alsPath, patch, before);
}

/**
 * Den Patch STRIKT im eindeutigen `<Transport>`-Fenster anwenden:
 * `patchArrangementLoop` (Throw → Fehlermeldung, kein Partial), danach
 * `isOnlyWindowChanged` gegen das exakte `<Transport>`-Byte-Fenster.
 * @param xml - Roher `.als`-XML-String vor dem Patch.
 * @param patch - Zu setzende Loop-Felder.
 * @returns `{ xml }` bei Erfolg, sonst `{ error }` mit der Fehlermeldung.
 */
function patchWithinTransport(
  xml: string,
  patch: ArrLoopPatch,
): { xml: string } | { error: string } {
  const tMatch = xml.match(/<Transport>[\S\s]*?<\/Transport>/);
  // Der `?? 0`/`null`-Fallback ist unerreichbar: patchArrangementLoop
  // wirft bei fehlendem <Transport> zuerst, der catch returnt {error}
  // bevor isOnlyWindowChanged dieses Fenster nutzt.
  const tStart = tMatch?.index ?? 0;
  const tEnd = tStart + (tMatch == null ? 0 : tMatch[0].length);
  let updated: string;

  try {
    updated = arrLoopInternals.patchArrangementLoop(xml, patch);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  if (!isOnlyWindowChanged(xml, updated, tStart, tEnd)) {
    return { error: "unerwartete Aenderung ausserhalb des <Transport>-Blocks" };
  }

  return { xml: updated };
}

/**
 * Patch aus `--on`/`--start`/`--length` bauen und haerten. `--on` ∈
 * {true,false} → bool; `--start`/`--length` endliche Zahl ≥0 (Float-String
 * woertlich durchgereicht). Ungueltiger Wert → stderr + `null` (Caller exit 1).
 * @param flags - Geparste Flag-Map.
 * @returns Der Patch, oder `null` bei ungueltigem Wert.
 */
function buildPatch(flags: Record<string, string>): ArrLoopPatch | null {
  const patch: ArrLoopPatch = {};

  if (flags.on != null) {
    if (flags.on !== "true" && flags.on !== "false") {
      process.stderr.write("FEHLER: --on muss true oder false sein\n");

      return null;
    }

    patch.on = flags.on === "true";
  }

  if (flags.start != null) {
    if (!isNonNegNumber(flags.start)) {
      process.stderr.write("FEHLER: --start muss eine Zahl >=0 sein\n");

      return null;
    }

    patch.start = flags.start;
  }

  if (flags.length != null) {
    if (!isNonNegNumber(flags.length)) {
      process.stderr.write("FEHLER: --length muss eine Zahl >=0 sein\n");

      return null;
    }

    patch.length = flags.length;
  }

  return patch;
}

/**
 * Wert-gebundenes Re-Parse-Verify: zurueckgelesener Loop muss in den
 * gepatchten Feldern == Soll und in ungepatchten == vorher sein (NICHT
 * Tag-Existenz — Lehre Mixer/warp/midi/shift/routing/scale).
 * @param alsPath - Pfad zur geschriebenen `.als`-Datei.
 * @param patch - Der angewandte Patch.
 * @param before - Loop-Zustand vor dem Write.
 * @returns Exit-Code: 0 verifiziert, 1 Mismatch.
 */
function verify(alsPath: string, patch: ArrLoopPatch, before: ArrLoop): number {
  const now = getArrangementLoop(readAls(alsPath));
  const wantOn = patch.on ?? before.on;
  const wantStart = patch.start ?? before.start;
  const wantLength = patch.length ?? before.length;

  if (
    now.on !== wantOn ||
    now.start !== wantStart ||
    now.length !== wantLength
  ) {
    process.stderr.write("FEHLER: Re-Parse-Verify fehlgeschlagen\n");

    return 1;
  }

  process.stdout.write(
    JSON.stringify({ arrangementLoop: now, verified: true }),
  );

  return 0;
}

/**
 * Pruefen ob `s` eine endliche Zahl ≥0 ist (Float-String erlaubt).
 * @param s - Roh-Flag-Wert.
 * @returns True iff endliche Zahl ≥0.
 */
function isNonNegNumber(s: string): boolean {
  const n = Number(s);

  return s.trim() !== "" && Number.isFinite(n) && n >= 0;
}
