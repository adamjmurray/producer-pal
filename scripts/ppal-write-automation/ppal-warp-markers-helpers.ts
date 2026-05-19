// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { isSetLikelyOpen } from "#src/automation/als-file.ts";
import {
  getWarpMarkers,
  patchWarpMarkers,
  type WarpMarker,
} from "#src/automation/als-warp-markers.ts";
import { locateClipWithinTrack } from "./clip-patch-cli.ts";
import { type LeanLoc, runLeanTrackCli } from "./lean-track-cli.ts";

/**
 * Mutable Spy-Seam: Open-Set-Guard und Patch-Transform werden hierueber
 * aufgerufen, damit Tests sie ueber `vi.spyOn(warpInternals, …)` ohne
 * verbotenen Self-Import verfaelschen/forcieren koennen.
 */
export const warpInternals = { isSetLikelyOpen, patchWarpMarkers };

/**
 * Track/Clip-Block auf die einheitliche `{block,start,end}`-Form
 * normalisieren (`locateClipWithinTrack` liefert bereits `start`).
 *
 * @param xml - Roher `.als`-XML-Inhalt.
 * @param flags - Geparster Flag-Map (nutzt `--track`/`--clip`).
 * @returns Normalisierte Block-Lokation.
 */
function locate(xml: string, flags: Record<string, string>): LeanLoc {
  const loc = locateClipWithinTrack(
    xml,
    flags.track as string,
    flags.clip as string,
  );

  return { block: loc.block, start: loc.start, end: loc.end };
}

/**
 * Run the `warp-marker get|set` subcommand (offline byte-true WarpMarker-
 * Liste eines Ziel-AudioClips). Lean clip-scoped Pfad analog
 * `runMixerRouting`: locate -> patch -> Offset-Splice -> backup -> write ->
 * wert-gebundenes Re-Parse-Verify. Open-Set-Guard (exit 2 ohne `--force`).
 *
 * @param rest - Argument-Array ohne das `warp-marker`-Token.
 * @param parseFlags - Geteilter Flag-Parser aus dem CLI-Modul.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runWarpMarker(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  return runLeanTrackCli<WarpMarker[], WarpMarker[]>(rest, parseFlags, {
    label: "warp-marker",
    requiredFlags: {
      names: ["als", "track", "clip"],
      errMsg: "FEHLER: --als, --track, --clip erforderlich\n",
    },
    locate,
    getJson: (flags, loc) => ({
      track: flags.track,
      clip: flags.clip,
      warpMarkers: getWarpMarkers(loc.block),
    }),
    parseSetCtx: (flags) => {
      const markers = parseMarkers(flags.markers);

      if (markers == null) {
        return {
          errMsg: 'FEHLER: --markers "beat:sec,beat:sec,…" erforderlich\n',
        };
      }

      return { ctx: markers };
    },
    isSetOpen: () => warpInternals.isSetLikelyOpen(),
    blockGuard: (loc) =>
      loc.block.startsWith("<AudioClip")
        ? null
        : "FEHLER: Warp-Marker nur fuer AudioClip (Clip ist MidiClip)\n",
    transform: (loc, ctx) => warpInternals.patchWarpMarkers(loc.block, ctx),
    windowErrMsg:
      "FEHLER: unerwartete Änderung außerhalb des Ziel-Clip-Blocks\n",
    computeExpected: (_loc, ctx) => ctx,
    verifyEqual: (reLoc, exp) => {
      const actual = getWarpMarkers(reLoc.block);
      const ids = [...reLoc.block.matchAll(/<WarpMarker Id="(\d+)"/g)].map(
        (m) => Number(m[1]),
      );
      const idsDense =
        ids.length === exp.length && ids.every((v, i) => v === i);

      return (
        idsDense &&
        actual.length === exp.length &&
        exp.every((e, i) => {
          const m = actual[i];

          return m?.secTime === e.secTime && m.beatTime === e.beatTime;
        })
      );
    },
    verifyFailMsg: "FEHLER: Re-Parse-Verify fehlgeschlagen (Marker != Soll)\n",
    setJson: (flags, _ctx, reLoc) => ({
      track: flags.track,
      clip: flags.clip,
      warpMarkers: getWarpMarkers(reLoc.block),
      verified: true,
    }),
  });
}

/**
 * `--markers "beat:sec,beat:sec,…"` per reinem String-Split parsen (NIE
 * Number — Float-Literale werden woertlich an `patchWarpMarkers` gereicht).
 *
 * @param raw - Roher `--markers`-Flag-Wert (oder undefined).
 * @returns Marker-Liste oder `null` bei fehlendem/leerem Flag.
 */
function parseMarkers(raw: string | undefined): WarpMarker[] | null {
  if (raw == null || raw === "true" || raw.trim() === "") {
    return null;
  }

  const markers: WarpMarker[] = [];

  for (const part of raw.split(",")) {
    const idx = part.indexOf(":");

    if (idx < 0) {
      return null;
    }

    markers.push({
      beatTime: part.slice(0, idx),
      secTime: part.slice(idx + 1),
    });
  }

  return markers;
}
