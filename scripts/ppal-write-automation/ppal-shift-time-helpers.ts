// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isSetLikelyOpen } from "#src/automation/als-file.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import {
  getArrangementClips,
  shiftTrackArrangementClips,
  type ArrClip,
} from "#src/automation/als-shift-time.ts";
import { type LeanLoc, runLeanTrackCli } from "./lean-track-cli.ts";

/**
 * Mutable Spy-Seam: Open-Set-Guard und Shift-Transform werden hierueber
 * aufgerufen, damit Tests sie ueber `vi.spyOn(shiftTimeInternals, …)` ohne
 * verbotenen Self-Import verfaelschen/forcieren koennen (Vorbild
 * `warpInternals`).
 */
export const shiftTimeInternals = {
  isSetLikelyOpen,
  shiftTrackArrangementClips,
};

/**
 * Transform-Kontext des `shift-time set`-Pfads. `shifted` wird vom
 * Transform NACH dem Aufruf eingetragen (vom Transform gemeldete Anzahl)
 * und fliesst byte-treu in Re-Parse-Verify und Erfolgs-JSON.
 */
interface ShiftCtx {
  fromBeat: number;
  delta: number;
  shifted: number;
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
 * Run the `shift-time get|set` subcommand (offline byte-true Track-Clips-
 * Arrangement-Shift). Lean track-scoped Pfad analog `runWarpMarker`:
 * locate -> shift -> Offset-Splice -> Fenster-Guard -> backup -> write ->
 * wert-gebundenes Re-Parse-Verify. Open-Set-Guard (exit 2 ohne `--force`).
 *
 * @param rest - Argument-Array ohne das `shift-time`-Token.
 * @param parseFlags - Geteilter Flag-Parser aus dem CLI-Modul.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runShiftTime(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  return runLeanTrackCli<ShiftCtx, { id: string; time: string }[]>(
    rest,
    parseFlags,
    {
      label: "shift-time",
      requiredFlags: {
        names: ["als", "track"],
        errMsg: "FEHLER: --als, --track erforderlich\n",
      },
      locate,
      getJson: (flags, loc) => ({
        track: flags.track,
        clips: getArrangementClips(loc.block),
      }),
      parseSetCtx: (flags) => {
        const fromRaw = flags["from-beat"];
        const deltaRaw = flags.delta;

        if (fromRaw == null || deltaRaw == null) {
          return {
            errMsg: "FEHLER: --from-beat und --delta erforderlich\n",
          };
        }

        return {
          ctx: {
            fromBeat: Number(fromRaw),
            delta: Number(deltaRaw),
            shifted: -1,
          },
        };
      },
      isSetOpen: () => shiftTimeInternals.isSetLikelyOpen(),
      // Soll-Liste UNABHAENGIG vom (potentiell verfaelschten) Transform aus
      // den Original-Clips berechnen: id stabil, Time = startBeat>=P ?
      // +delta : roh.
      computeExpected: (loc, ctx) =>
        expectedAfterShift(
          getArrangementClips(loc.block),
          ctx.fromBeat,
          ctx.delta,
        ),
      transform: (loc, ctx) => {
        const res = shiftTimeInternals.shiftTrackArrangementClips(
          loc.block,
          ctx.fromBeat,
          ctx.delta,
        );

        ctx.shifted = res.shifted;

        return res.block;
      },
      windowErrMsg:
        "FEHLER: unerwartete Änderung außerhalb des Ziel-Track-Blocks\n",
      verifyEqual: (reLoc, exp, ctx) => {
        const actual = getArrangementClips(reLoc.block);

        return (
          Number.isInteger(ctx.shifted) &&
          ctx.shifted >= 0 &&
          actual.length === exp.length &&
          exp.every((e, i) => {
            const a = actual[i];

            return a?.id === e.id && a.time === e.time;
          })
        );
      },
      verifyFailMsg: "FEHLER: Re-Parse-Verify fehlgeschlagen (Clips != Soll)\n",
      setJson: (flags, ctx) => ({
        track: flags.track,
        shifted: ctx.shifted,
        verified: true,
      }),
    },
  );
}

/**
 * Aus den Original-Arr-Clips die erwartete Liste NACH dem Shift berechnen
 * (rein, unabhaengig vom Transform): Clips mit startBeat>=fromBeat bekommen
 * `String(startBeat+delta)`, alle anderen ihren rohen Time-String; Id und
 * Reihenfolge bleiben. So faellt ein verfaelschter Transform-Output beim
 * Re-Parse-Vergleich auf.
 *
 * @param clips - Original-Arr-Clips (vor Write).
 * @param fromBeat - Schnittstelle P.
 * @param delta - Verschiebung D.
 * @returns Erwartete (id,time)-Paare in Dokumentreihenfolge.
 */
function expectedAfterShift(
  clips: ArrClip[],
  fromBeat: number,
  delta: number,
): { id: string; time: string }[] {
  return clips.map((c) => ({
    id: c.id,
    time: c.startBeat >= fromBeat ? String(c.startBeat + delta) : c.time,
  }));
}
