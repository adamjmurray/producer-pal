// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { isSetLikelyOpen } from "#src/automation/als-file.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import {
  getTakeLanes,
  patchTakeLanes,
  type TakeLaneSpec,
} from "#src/automation/als-takelane.ts";
import { type LeanLoc, runLeanTrackCli } from "./lean-track-cli.ts";

/** Eindeutiges Wrapper-Ende (AreTakeLanesFolded 1×/Wrapper, Premortem R1). */
const WRAPPER_RE =
  /<TakeLanes>[\S\s]*?<AreTakeLanesFolded Value="\w+" \/>\s*<\/TakeLanes>/;

/**
 * Mutable Spy-Seam: Open-Set-Guard und Patch-Transform werden hierueber
 * aufgerufen, damit Tests sie ueber `vi.spyOn(takeLaneInternals, …)` ohne
 * verbotenen Self-Import verfaelschen/forcieren koennen.
 */
export const takeLaneInternals = { isSetLikelyOpen, patchTakeLanes };

/**
 * Den `<TakeLanes>`-Wrapper INNERHALB des per `locateTrackBlock`
 * aufgeloesten Track-Blocks lokalisieren und auf `{block,start,end}` mit
 * ABSOLUTEM Whole-XML-Offset normalisieren (track-lokal, self-contained).
 *
 * @param xml - Roher `.als`-XML-Inhalt.
 * @param flags - Geparster Flag-Map (nutzt `--track`).
 * @returns Normalisierte Wrapper-Lokation.
 */
function locate(xml: string, flags: Record<string, string>): LeanLoc {
  const trk = locateTrackBlock(xml, flags.track as string);
  const m = trk.block.match(WRAPPER_RE);

  if (m?.index == null) {
    throw new Error(
      `<TakeLanes>-Wrapper im Track "${flags.track}" nicht gefunden`,
    );
  }

  const start = trk.index + m.index;

  return { block: m[0], start, end: start + m[0].length };
}

/**
 * Run the `take-lane get|set` subcommand (offline byte-true Take-Lanes
 * eines Tracks). `set` ueberfuehrt den leeren Default-`<TakeLanes>`-
 * Wrapper byte-treu in den populierten Zustand aus EXPLIZITEN Lane-Specs
 * (`--lanes-file` JSON; keine geratenen Werte). Lean track-scoped Pfad:
 * locate -> patch -> Offset-Splice -> backup -> write -> wert-gebundenes
 * Re-Parse-Verify. Open-Set-Guard (exit 2 ohne `--force`).
 *
 * @param rest - Argument-Array ohne das `take-lane`-Token.
 * @param parseFlags - Geteilter Flag-Parser aus dem CLI-Modul.
 * @returns Exit-Code: 0 Erfolg, 1 Fehler, 2 Open-Set-Guard.
 */
export function runTakeLane(
  rest: string[],
  parseFlags: (argv: string[]) => Record<string, string>,
): number {
  return runLeanTrackCli<TakeLaneSpec[], TakeLaneSpec[]>(rest, parseFlags, {
    label: "take-lane",
    requiredFlags: {
      names: ["als", "track"],
      errMsg: "FEHLER: --als, --track erforderlich\n",
    },
    locate,
    getJson: (flags, loc) => {
      const parsed = getTakeLanes(loc.block);

      return {
        track: flags.track,
        folded: parsed.folded,
        lanes: parsed.lanes,
      };
    },
    parseSetCtx: (flags) => {
      const lanes = parseLanesFile(flags["lanes-file"]);

      if (lanes == null) {
        return {
          errMsg:
            "FEHLER: --lanes-file <JSON-Datei mit TakeLaneSpec[]> " +
            "erforderlich (nicht-leeres Array)\n",
        };
      }

      return { ctx: lanes };
    },
    isSetOpen: () => takeLaneInternals.isSetLikelyOpen(),
    transform: (loc, ctx) => takeLaneInternals.patchTakeLanes(loc.block, ctx),
    windowErrMsg:
      "FEHLER: unerwartete Änderung außerhalb des Take-Lanes-Fensters\n",
    computeExpected: (_loc, ctx) => ctx,
    verifyEqual: (reLoc, exp) => {
      const parsed = getTakeLanes(reLoc.block);

      return (
        !parsed.folded &&
        parsed.lanes.length === exp.length &&
        exp.every((e, i) => {
          const a = parsed.lanes[i];

          return (
            a?.id === e.id &&
            a.takeId === e.takeId &&
            a.height === e.height &&
            a.isContentSelected === e.isContentSelected &&
            a.clipXml === e.clipXml
          );
        })
      );
    },
    verifyFailMsg:
      "FEHLER: Re-Parse-Verify fehlgeschlagen (Take-Lanes != Soll)\n",
    setJson: (flags, ctx) => ({
      track: flags.track,
      written: ctx.length,
      verified: true,
    }),
  });
}

/**
 * `--lanes-file` lesen und als nicht-leeres `TakeLaneSpec[]` validieren.
 * JSON-Parse-Fehler / Nicht-Array / leeres Array -> `null`.
 *
 * @param path - Roher `--lanes-file`-Flag-Wert (oder undefined).
 * @returns Lane-Specs oder `null` bei fehlendem/ungueltigem Flag.
 */
function parseLanesFile(path: string | undefined): TakeLaneSpec[] | null {
  if (path == null || path === "true" || path.trim() === "") {
    return null;
  }

  let data: unknown;

  try {
    data = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return data as TakeLaneSpec[];
}
