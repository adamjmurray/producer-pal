// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { type ReplacementRange } from "./clip-patch-cli.ts";

/**
 * Subcommand-Validierung fuer get|set-only Slice-Helper. Schreibt
 * `FEHLER: <name> get|set\n` auf stderr und liefert null bei Verletzung;
 * sonst den validen Subcommand-String. Eliminiert die strukturelle
 * Duplikation zwischen den runXxx-Eintrittspunkten der Schwester-Helper
 * (arrangement-loop, take-lane, group-create).
 *
 * @param rest - Roh-Argv ab Subcommand-Position.
 * @param name - CLI-Subcommand-Name fuer die Fehlermeldung.
 * @returns Valider Subcommand oder null.
 */
export function requireGetOrSet(
  rest: string[],
  name: string,
): "get" | "set" | null {
  const sub = rest[0];

  if (sub !== "get" && sub !== "set") {
    process.stderr.write(`FEHLER: ${name} get|set\n`);

    return null;
  }

  return sub;
}

/** Geparste get|set-CLI-Prelude: validierter Subcommand + Flags + als-Pfad. */
export interface AlsCliPrelude {
  sub: "get" | "set";
  flags: Record<string, string>;
  alsPath: string;
}

/**
 * Standard-Prelude fuer set-globale get|set-CLI-Helper: subcommand-Check
 * (`requireGetOrSet`) -> `parseFlags` -> `--als`-Pflichtfeld-Check. Bei
 * Verletzung wird die passende stderr-Meldung geschrieben und null
 * geliefert (Caller exit 1). Eliminiert die 12-Zeilen-Prelude-Duplikation
 * zwischen arrangement-loop und group-create (set-globale Helper ohne
 * runLeanTrackCli/runLeanClipCli).
 *
 * @param rest - Argv ab Subcommand-Position.
 * @param name - CLI-Subcommand-Name fuer die Fehlermeldungen.
 * @param parseFlags - Geteilter Flag-Parser.
 * @returns Geparste Prelude oder null.
 */
export function requireAlsCliPrelude(
  rest: string[],
  name: string,
  parseFlags: (argv: string[]) => Record<string, string>,
): AlsCliPrelude | null {
  const sub = requireGetOrSet(rest, name);

  if (sub == null) return null;

  const flags = parseFlags(rest);
  const alsPath = flags.als;

  if (alsPath == null) {
    process.stderr.write("FEHLER: --als erforderlich\n");

    return null;
  }

  return { sub, flags, alsPath };
}

/**
 * Eine `--xxx-file`-JSON-Datei einlesen und gegen einen Typguard
 * validieren. Pfad fehlend/leer/"true" liefert null (typischer
 * "Flag ohne Wert"-Fall), JSON-Parse-Fehler oder Validator-Reject
 * ebenfalls null. Caller mappt null auf exit 1. Eliminiert die
 * parseXxxFile-Skelett-Duplikation der Schwester-Helper.
 *
 * @param path - Roher Flag-Wert (oder undefined).
 * @param validate - Typguard fuer den geparsten Inhalt.
 * @returns Validierter Inhalt oder null.
 */
export function parseJsonFile<T>(
  path: string | undefined,
  validate: (data: unknown) => data is T,
): T | null {
  if (path == null || path === "true" || path.trim() === "") {
    return null;
  }

  let data: unknown;

  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }

  if (!validate(data)) {
    return null;
  }

  return data;
}

/**
 * Aus dem alten Prefix/Suffix-Single-Window-Guard eine
 * `ReplacementRange` aufbauen. Formal:
 * `replacement = updated.slice(start, updated.length - (xml.length - end))`.
 * Diese Slice-Formel ist mechanisch korrekt: was im `updated` zwischen
 * dem unveraenderten Prefix `[0, start)` und dem unveraenderten Suffix
 * (Laenge `xml.length - end`) liegt, sind genau die neuen Bytes des
 * Fensters. Sie bleibt aequivalent zur alten Prefix/Suffix-Semantik,
 * der neue Guard prueft dann aber ZUSAETZLICH die Mitte byte-genau.
 *
 * @param xml - Original-XML vor dem Patch.
 * @param updated - Komplettes XML nach dem Patch.
 * @param start - Inklusive Start-Position des Fensters im Original-`xml`.
 * @param end - Exklusive End-Position des Fensters im Original-`xml`.
 * @returns `ReplacementRange` mit den extrahierten Replacement-Bytes.
 */
export function singleRangeReplacement(
  xml: string,
  updated: string,
  start: number,
  end: number,
): ReplacementRange {
  const replacement = updated.slice(start, updated.length - (xml.length - end));

  return { start, end, replacement };
}
