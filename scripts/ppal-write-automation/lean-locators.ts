// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import { type LeanLoc } from "./lean-track-cli.ts";

/**
 * Track-Block auf die einheitliche `{block,start,end}`-Form normalisieren
 * (`locateTrackBlock` liefert `index`; `start = index`). Geteilter
 * Helper fuer lean track-scoped Sister-Pfade (routing, shift-time) — vor
 * der Extraktion 28-Zeilen-Token-Klon zwischen ppal-routing-helpers.ts und
 * ppal-shift-time-helpers.ts, jetzt eine Quelle der Wahrheit.
 *
 * @param xml - Roher `.als`-XML-Inhalt.
 * @param flags - Geparster Flag-Map (nutzt `--track`).
 * @returns Normalisierte Block-Lokation.
 */
export function locateTrackLeanBlock(
  xml: string,
  flags: Record<string, string>,
): LeanLoc {
  const loc = locateTrackBlock(xml, flags.track as string);

  return { block: loc.block, start: loc.index, end: loc.end };
}
