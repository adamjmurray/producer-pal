// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { backupAls, readAls, writeAls } from "#src/automation/als-file.ts";
import { isOnlyWindowChanged } from "./clip-patch-cli.ts";
import { singleRangeReplacement } from "./shared-cli-helpers.ts";

/**
 * Einheitlich normalisierte Block-Lokation: `locateTrackBlock` liefert
 * `{block,index,end}`, `locateClipWithinTrack` `{block,start,end}` — die
 * Adapter normalisieren beides auf `{block,start,end}` (Splice-Offset =
 * `start`).
 */
export interface LeanLoc {
  block: string;
  start: number;
  end: number;
}

/**
 * Divergenzpunkt-Konfiguration einer konkreten lean track-scoped CLI. Jeder
 * Callback kapselt ausschliesslich das, was zwischen routing/shift-time/
 * warp-markers UNTERSCHIEDLICH ist; das gemeinsame get|set-Skelett liegt im
 * generischen Runner. Spy-Seams werden via `isSetOpen`/`transform` als
 * Closures durchgereicht (Aufruf zur Laufzeit -> `vi.spyOn` bleibt wirksam).
 *
 * @template Ctx - Aus den set-Flags abgeleiteter Transform-Kontext.
 * @template Exp - Unabhaengig berechnetes Soll fuer das Re-Parse-Verify.
 */
export interface LeanTrackCfg<Ctx, Exp> {
  /** Subcommand-Label fuer die `FEHLER: <label> get|set`-Meldung. */
  label: string;
  /** Pflicht-Flag-Namen und die exakte bestehende Fehlermeldung. */
  requiredFlags: { names: string[]; errMsg: string };
  /**
   * Ziel-Block lokalisieren und auf `{block,start,end}` normalisieren.
   * @param xml - Roher `.als`-XML-Inhalt.
   * @param flags - Geparster Flag-Map.
   * @returns Normalisierte Block-Lokation.
   */
  locate: (xml: string, flags: Record<string, string>) => LeanLoc;
  /**
   * stdout-JSON-Payload des get-Pfads (ohne Trailing-Newline).
   * @param flags - Geparster Flag-Map.
   * @param loc - Normalisierte Block-Lokation.
   * @returns Zu serialisierendes JSON-Objekt.
   */
  getJson: (flags: Record<string, string>, loc: LeanLoc) => object;
  /**
   * set-spezifische Extra-Flags parsen (eigene exakte Fehlermeldung).
   * @param flags - Geparster Flag-Map.
   * @returns `{ ctx }` bei Erfolg oder `{ errMsg }` bei Flag-Fehler.
   */
  parseSetCtx: (
    flags: Record<string, string>,
  ) => { ctx: Ctx } | { errMsg: string };
  /**
   * Open-Set-Guard (Caller reicht `<internals>.isSetLikelyOpen` als Closure).
   * @returns `true` wenn ein Set offen scheint.
   */
  isSetOpen: () => boolean;
  /**
   * Optionaler Guard NACH Open-Set-Guard + locate, VOR computeExpected/
   * transform (z.B. AudioClip-Pflicht oder kind/target-Konsistenz).
   * @param loc - Normalisierte Block-Lokation.
   * @param ctx - Aus den set-Flags abgeleiteter Kontext.
   * @returns Exakte Fehlermeldung oder `null` wenn alles ok ist.
   */
  blockGuard?: (loc: LeanLoc, ctx: Ctx) => string | null;
  /**
   * Block transformieren (Caller bindet `<internals>.<patchFn>` ein; darf
   * werfen -> exit 1, kein Partial-Write).
   * @param loc - Normalisierte Block-Lokation.
   * @param ctx - Aus den set-Flags abgeleiteter Kontext.
   * @returns Neuer Block-String.
   */
  transform: (loc: LeanLoc, ctx: Ctx) => string;
  /** Exakte Fehlermeldung des Ausserhalb-Fenster-Guards. */
  windowErrMsg: string;
  /**
   * Soll fuer das Re-Parse-Verify aus den ORIGINAL-Daten berechnen (vor
   * Write, unabhaengig vom potentiell verfaelschten Transform).
   * @param loc - Normalisierte Block-Lokation (vor Write).
   * @param ctx - Aus den set-Flags abgeleiteter Kontext.
   * @returns Erwartetes Soll.
   */
  computeExpected: (loc: LeanLoc, ctx: Ctx) => Exp;
  /**
   * Zurueckgelesenes Re-Locate gegen das Soll wert-gebunden vergleichen.
   * @param reLoc - Re-Locate nach dem Write.
   * @param exp - Vorab berechnetes Soll.
   * @param ctx - Aus den set-Flags abgeleiteter Kontext.
   * @returns `true` wenn der zurueckgelesene Zustand exakt dem Soll entspricht.
   */
  verifyEqual: (reLoc: LeanLoc, exp: Exp, ctx: Ctx) => boolean;
  /** Exakte Fehlermeldung bei fehlgeschlagenem Re-Parse-Verify. */
  verifyFailMsg: string;
  /**
   * stdout-JSON-Payload des erfolgreichen set-Pfads (ohne Newline).
   * @param flags - Geparster Flag-Map.
   * @param ctx - Aus den set-Flags abgeleiteter Kontext.
   * @param reLoc - Re-Locate nach dem Write.
   * @returns Zu serialisierendes JSON-Objekt.
   */
  setJson: (flags: Record<string, string>, ctx: Ctx, reLoc: LeanLoc) => object;
}

/**
 * Generisches lean track-scoped `get|set`-Skelett. Kapselt das zwischen
 * routing/shift-time/warp-markers IDENTISCHE Orchestrierungs-Geruest
 * (Subcommand-Guard, Pflicht-Flags, get-JSON, Open-Set-Guard,
 * read/locate/transform/Fenster-Guard/backup/write, wert-gebundenes
 * Re-Parse-Verify). Alle Divergenzen liegen in `cfg`. Verhalten
 * (stderr-Texte, Exit-Codes, stdout-JSON) ist byte-identisch zu den
 * vormals dreifach duplizierten Implementierungen.
 *
 * @template Ctx - Transform-Kontext aus den set-Flags.
 * @template Exp - Re-Parse-Verify-Soll.
 * @param rest - Argument-Array ohne das Subcommand-Token.
 * @param parseFlags - Geteilter Flag-Parser aus dem CLI-Modul.
 * @param cfg - Divergenzpunkt-Konfiguration der konkreten CLI.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runLeanTrackCli<Ctx, Exp>(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
  cfg: LeanTrackCfg<Ctx, Exp>,
): number {
  const sub = rest[0];

  if (sub !== "get" && sub !== "set") {
    process.stderr.write(`FEHLER: ${cfg.label} get|set\n`);

    return 1;
  }

  const flags = parseFlags(rest);

  if (cfg.requiredFlags.names.some((n) => flags[n] == null)) {
    process.stderr.write(cfg.requiredFlags.errMsg);

    return 1;
  }

  if (sub === "get") {
    const loc = cfg.locate(readAls(flags.als as string), flags);

    process.stdout.write(`${JSON.stringify(cfg.getJson(flags, loc))}\n`);

    return 0;
  }

  return runLeanSet(flags, cfg);
}

/**
 * Den generischen `set`-Pfad ausfuehren: Extra-Flags, Open-Set-Guard,
 * locate, optionaler Block-Guard, transform (Throw -> exit 1, kein
 * Partial-Write), Fenster-Guard, backup + write, wert-gebundenes
 * Re-Parse-Verify.
 *
 * @template Ctx - Transform-Kontext aus den set-Flags.
 * @template Exp - Re-Parse-Verify-Soll.
 * @param flags - Geparster Flag-Map.
 * @param cfg - Divergenzpunkt-Konfiguration der konkreten CLI.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
function runLeanSet<Ctx, Exp>(
  flags: Record<string, string>,
  cfg: LeanTrackCfg<Ctx, Exp>,
): number {
  const parsed = cfg.parseSetCtx(flags);

  if ("errMsg" in parsed) {
    process.stderr.write(parsed.errMsg);

    return 1;
  }

  const ctx = parsed.ctx;

  if (cfg.isSetOpen() && flags.force !== "true") {
    process.stderr.write(
      "Set scheint offen (Port 3350). Schliesse es in Ableton oder nutze --force.\n",
    );

    return 2;
  }

  // `--als` ist fuer alle Aufrufer in `requiredFlags` -> nach dem
  // requiredFlags-Guard laufzeit-garantiert (spiegelt das Original-
  // Narrowing nach `if (alsPath == null) return 1`).
  const alsPath = flags.als as string;
  const xml = readAls(alsPath);
  const loc = cfg.locate(xml, flags);

  if (cfg.blockGuard != null) {
    const guardMsg = cfg.blockGuard(loc, ctx);

    if (guardMsg != null) {
      process.stderr.write(guardMsg);

      return 1;
    }
  }

  const expected = cfg.computeExpected(loc, ctx);

  let updated: string;

  try {
    const newBlock = cfg.transform(loc, ctx);

    updated = xml.slice(0, loc.start) + newBlock + xml.slice(loc.end);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    process.stderr.write(`FEHLER: ${msg}\n`);

    return 1;
  }

  if (
    !isOnlyWindowChanged(xml, updated, [
      singleRangeReplacement(xml, updated, loc.start, loc.end),
    ])
  ) {
    process.stderr.write(cfg.windowErrMsg);

    return 1;
  }

  backupAls(alsPath);
  writeAls(alsPath, updated);

  return verifyLean(flags, cfg, expected, ctx);
}

/**
 * Wert-gebundenes Re-Parse-Verify (Premortem R3): re-locate, dann
 * `cfg.verifyEqual` gegen das vorab unabhaengig berechnete Soll. Bei
 * Mismatch die exakte CLI-spezifische Fehlermeldung, sonst das
 * CLI-spezifische Erfolgs-JSON.
 *
 * @template Ctx - Transform-Kontext aus den set-Flags.
 * @template Exp - Re-Parse-Verify-Soll.
 * @param flags - Geparster Flag-Map.
 * @param cfg - Divergenzpunkt-Konfiguration der konkreten CLI.
 * @param expected - Vorab berechnetes Soll.
 * @param ctx - Aus den set-Flags abgeleiteter Kontext.
 * @returns Exit-Code: 0 verifiziert, 1 Mismatch.
 */
function verifyLean<Ctx, Exp>(
  flags: Record<string, string>,
  cfg: LeanTrackCfg<Ctx, Exp>,
  expected: Exp,
  ctx: Ctx,
): number {
  const reLoc = cfg.locate(readAls(flags.als as string), flags);

  if (!cfg.verifyEqual(reLoc, expected, ctx)) {
    process.stderr.write(cfg.verifyFailMsg);

    return 1;
  }

  process.stdout.write(`${JSON.stringify(cfg.setJson(flags, ctx, reLoc))}\n`);

  return 0;
}
