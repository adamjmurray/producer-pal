// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isSetLikelyOpen } from "#src/automation/als-file.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import {
  getTrackRouting,
  patchTrackRouting,
  ROUTING_TARGETS,
  type RoutingKind,
  type RoutingValue,
} from "#src/automation/als-routing.ts";
import { type LeanLoc, runLeanTrackCli } from "./lean-track-cli.ts";

/**
 * Mutable Spy-Seam: Open-Set-Guard und Routing-Patch werden hierueber
 * aufgerufen, damit Tests sie ueber `vi.spyOn(routingInternals, …)` ohne
 * verbotenen Self-Import verfaelschen/forcieren koennen (Vorbild
 * `shiftTimeInternals`).
 */
export const routingInternals = {
  isSetLikelyOpen,
  patchTrackRouting,
};

/**
 * Transform-Kontext des `routing set`-Pfads: die aus der byte-belegten
 * Tabelle aufgeloeste kind/target-Kombination samt erwartetem Soll-Tripel.
 */
interface RoutingCtx {
  kindRaw: string;
  kind: RoutingKind;
  target: string;
}

/**
 * Track-Block auf die einheitliche `{block,start,end}`-Form normalisieren
 * (`locateTrackBlock` liefert `index`; `start = index`).
 *
 * @param xml - Roher `.als`-XML-Inhalt.
 * @param flags - Geparster Flag-Map (nutzt `--track`).
 * @returns Normalisierte Block-Lokation.
 */
function locate(xml: string, flags: Record<string, string>): LeanLoc {
  const loc = locateTrackBlock(xml, flags.track as string);

  return { block: loc.block, start: loc.index, end: loc.end };
}

/**
 * Run the `routing get|set` subcommand (offline byte-true Track-I/O-
 * Routing aus dem well-known closed vocabulary). Lean track-scoped Pfad
 * analog `runShiftTime`: locate -> patch -> Offset-Splice -> Fenster-Guard
 * -> backup -> write -> wert-gebundenes Re-Parse-Verify. Open-Set-Guard
 * (exit 2 ohne `--force`).
 *
 * @param rest - Argument-Array ohne das `routing`-Token.
 * @param parseFlags - Geteilter Flag-Parser aus dem CLI-Modul.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runRouting(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  return runLeanTrackCli<RoutingCtx, RoutingValue>(rest, parseFlags, {
    label: "routing",
    requiredFlags: {
      names: ["als", "track"],
      errMsg: "FEHLER: --als, --track erforderlich\n",
    },
    locate,
    getJson: (flags, loc) => ({
      track: flags.track,
      routing: getTrackRouting(loc.block),
    }),
    parseSetCtx: (flags) => {
      const kindRaw = flags.kind;
      const target = flags.target;

      if (kindRaw == null || target == null) {
        return { errMsg: "FEHLER: --kind und --target erforderlich\n" };
      }

      return { ctx: { kindRaw, kind: kindRaw as RoutingKind, target } };
    },
    isSetOpen: () => routingInternals.isSetLikelyOpen(),
    // Konsistenz-Check NACH Open-Set-Guard + locate (Original-Position):
    // ein Lookup-Miss = inkonsistente kind/target-Kombi -> Fehler VOR Write
    // (R4). `kind`/`target` sind ungeprueft gecastete CLI-Eingaben, daher
    // laufzeit-ehrliche hasOwn-Guards (kein toter Branch).
    blockGuard: (_loc, ctx) =>
      !Object.hasOwn(ROUTING_TARGETS, ctx.kind) ||
      !Object.hasOwn(ROUTING_TARGETS[ctx.kind], ctx.target)
        ? `FEHLER: inkonsistente Kombination kind="${ctx.kindRaw}" target="${ctx.target}"\n`
        : null,
    transform: (loc, ctx) =>
      routingInternals.patchTrackRouting(loc.block, ctx.kind, ctx.target),
    windowErrMsg:
      "FEHLER: unerwartete Änderung außerhalb des Ziel-Track-Blocks\n",
    computeExpected: (_loc, ctx) =>
      ROUTING_TARGETS[ctx.kind][ctx.target] as RoutingValue,
    verifyEqual: (reLoc, exp, ctx) => {
      const actual = getTrackRouting(reLoc.block)[ctx.kind];

      return (
        actual.target === exp.target &&
        actual.upper === exp.upper &&
        actual.lower === exp.lower
      );
    },
    verifyFailMsg: "FEHLER: Re-Parse-Verify fehlgeschlagen (Routing != Soll)\n",
    setJson: (flags, ctx) => ({
      track: flags.track,
      kind: ctx.kind,
      target: ctx.target,
      verified: true,
    }),
  });
}
