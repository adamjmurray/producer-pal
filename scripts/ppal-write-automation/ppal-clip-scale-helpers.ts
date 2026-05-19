// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  getClipScale,
  patchClipScale,
} from "#src/automation/als-clip-scale.ts";
import { isSetLikelyOpen } from "#src/automation/als-file.ts";
import { VALID_SCALE_NAMES } from "#src/tools/constants.ts";
import { locateClipWithinTrack } from "./clip-patch-cli.ts";
import { runLeanTrackCli } from "./lean-track-cli.ts";

/** Aus den set-Flags abgeleiteter Transform-Kontext (root + Scale-Name). */
interface ScaleCtx {
  root: number;
  scaleName: string;
}

/**
 * Mutable Spy-Seam: Open-Set-Guard und Patch-Transform werden hierueber
 * aufgerufen, damit Tests sie ueber `vi.spyOn(clipScaleInternals, …)` ohne
 * verbotenen Self-Import verfaelschen/forcieren koennen.
 */
export const clipScaleInternals = { isSetLikelyOpen, patchClipScale };

/**
 * Run the `clip-scale get|set` subcommand (offline byte-true Root+Scale-Name
 * eines Ziel-MidiClips). Lean clip-scoped Pfad analog `runWarpMarker`:
 * locate -> patch -> Offset-Splice -> backup -> write -> wert-gebundenes
 * Re-Parse-Verify. Open-Set-Guard (exit 2 ohne `--force`).
 *
 * @param rest - Argument-Array ohne das `clip-scale`-Token.
 * @param parseFlags - Geteilter Flag-Parser aus dem CLI-Modul.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runClipScale(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  return runLeanTrackCli<ScaleCtx, { root: number; scaleIndex: number }>(
    rest,
    parseFlags,
    {
      label: "clip-scale",
      requiredFlags: {
        names: ["als", "track", "clip"],
        errMsg: "FEHLER: --als, --track, --clip erforderlich\n",
      },
      // locateClipWithinTrack liefert bereits {block,start,end} (= LeanLoc);
      // direkt durchreichen statt eines separaten Normalisierungs-Wrappers.
      locate: (xml, flags) =>
        locateClipWithinTrack(xml, flags.track as string, flags.clip as string),
      getJson: (flags, loc) => ({
        track: flags.track,
        clip: flags.clip,
        scale: getClipScale(loc.block),
      }),
      parseSetCtx: (flags) => {
        const ctx = parseScaleCtx(flags.root, flags.scale);

        if (ctx == null) {
          return {
            errMsg:
              "FEHLER: --root 0-11 und --scale <Name aus " +
              "VALID_SCALE_NAMES> erforderlich\n",
          };
        }

        return { ctx };
      },
      isSetOpen: () => clipScaleInternals.isSetLikelyOpen(),
      blockGuard: (loc) =>
        loc.block.startsWith("<MidiClip")
          ? null
          : "FEHLER: clip-scale nur fuer MidiClip (Clip ist AudioClip)\n",
      transform: (loc, ctx) =>
        clipScaleInternals.patchClipScale(loc.block, ctx.root, ctx.scaleName),
      windowErrMsg:
        "FEHLER: unerwartete Änderung außerhalb des Ziel-Clip-Blocks\n",
      computeExpected: (_loc, ctx) => ({
        root: ctx.root,
        scaleIndex: VALID_SCALE_NAMES.indexOf(
          ctx.scaleName as (typeof VALID_SCALE_NAMES)[number],
        ),
      }),
      verifyEqual: (reLoc, exp) => {
        const s = getClipScale(reLoc.block);

        return s.root === exp.root && s.scaleIndex === exp.scaleIndex;
      },
      verifyFailMsg: "FEHLER: Re-Parse-Verify fehlgeschlagen (Scale != Soll)\n",
      setJson: (flags, ctx) => ({
        track: flags.track,
        clip: flags.clip,
        root: ctx.root,
        scale: ctx.scaleName,
        verified: true,
      }),
    },
  );
}

/**
 * `--root` (int 0..11) und `--scale` (case-insensitiv ∈ VALID_SCALE_NAMES →
 * kanonischer Eintrag) parsen.
 *
 * @param rawRoot - Roher `--root`-Flag-Wert (oder undefined).
 * @param rawScale - Roher `--scale`-Flag-Wert (oder undefined).
 * @returns Kontext oder `null` bei fehlendem/ungültigem Flag.
 */
function parseScaleCtx(
  rawRoot: string | undefined,
  rawScale: string | undefined,
): ScaleCtx | null {
  if (rawRoot == null || rawScale == null) {
    return null;
  }

  const root = Number(rawRoot);

  if (!Number.isInteger(root) || root < 0 || root > 11) {
    return null;
  }

  const lower = rawScale.toLowerCase();
  const canonical = VALID_SCALE_NAMES.find((n) => n.toLowerCase() === lower);

  if (canonical == null) {
    return null;
  }

  return { root, scaleName: canonical };
}
