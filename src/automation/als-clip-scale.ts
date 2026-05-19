// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { VALID_SCALE_NAMES } from "#src/tools/constants.ts";

/** Gelesener Clip-Scale: Root-Pitch-Class + Name-Index + aufgelöster Name. */
export interface ClipScale {
  root: number;
  scaleIndex: number;
  scaleName: string | null;
}

/**
 * Den (eindeutigen, build-belegt 1×/Clip) `<ScaleInformation>`-Block eines
 * MidiClips byte-treu auf `root`+`scaleName` patchen. `<Root>` 0..11 und
 * `<Name>` = kanonischer `VALID_SCALE_NAMES`-Index werden ATOMAR ersetzt
 * (gezielter Attr-Replace je Tag via Replacer-Funktion, kein `$`-Pattern);
 * fehlt der Block oder ein Tag → Throw, kein Teil-Patch.
 *
 * @param clipXml - Der `<MidiClip>`-Block als String.
 * @param root - Ziel-Pitch-Class 0..11 (strikt Ganzzahl).
 * @param scaleName - Scale-Name (case-insensitiv ∈ VALID_SCALE_NAMES).
 * @returns Der Clip-Block mit ersetztem Root/Name.
 */
export function patchClipScale(
  clipXml: string,
  root: number,
  scaleName: string,
): string {
  if (!clipXml.startsWith("<MidiClip")) {
    throw new Error("clip-scale nur fuer MidiClip (Clip ist kein MidiClip)");
  }

  if (!Number.isInteger(root) || root < 0 || root > 11) {
    throw new Error(`Root muss Ganzzahl 0..11 sein (Wert "${root}")`);
  }

  const idx = scaleNameToIndex(scaleName);
  const match = clipXml.match(/<ScaleInformation>[\S\s]*?<\/ScaleInformation>/);

  if (match?.index == null) {
    throw new Error("<ScaleInformation>-Block im Clip nicht gefunden");
  }

  const block = match[0];
  const start = match.index;
  const end = start + block.length;
  const patched = patchTag(patchTag(block, "Root", root), "Name", idx);

  return clipXml.slice(0, start) + patched + clipXml.slice(end);
}

/**
 * Root/Name aus dem (eindeutigen) `<ScaleInformation>`-Block lesen. KEIN
 * Throw: ein Index außerhalb `VALID_SCALE_NAMES` liefert `scaleName=null`
 * (robust gegen fremde/künftige Live-Indizes).
 *
 * VERTRAG: erwartet einen EINZELNEN isolierten Clip-Block (wie von
 * `locateClipWithinTrack` geliefert) — matcht das ERSTE
 * `<ScaleInformation>`. Aufruf auf Whole-Set-XML würde den ersten Clip
 * treffen (Mis-Target); nie ungescopt aufrufen.
 *
 * @param clipXml - Einzelner Clip-Block als String.
 * @returns `{ root, scaleIndex, scaleName }`.
 */
export function getClipScale(clipXml: string): ClipScale {
  const rootMatch = clipXml.match(
    /<ScaleInformation>[\S\s]*?<Root Value="([^"]*)"/,
  );
  const nameMatch = clipXml.match(
    /<ScaleInformation>[\S\s]*?<Name Value="([^"]*)"/,
  );

  if (rootMatch == null || nameMatch == null) {
    throw new Error("<ScaleInformation> mit Root+Name nicht gefunden");
  }

  // Capture-Group 1 ist im Regex Pflicht ([^"]*) -> bei einem Match stets
  // gesetzt; die noUncheckedIndexedAccess-Defaults bleiben unerreichbar
  // (kein toter Laufzeit-Zweig, Block-Fehlen wirft bereits oben).
  const [, root = ""] = rootMatch;
  const [, name = ""] = nameMatch;
  const scaleIndex = Number(name);
  const names: readonly string[] = VALID_SCALE_NAMES;
  const resolved = names[scaleIndex];

  return {
    root: Number(root),
    scaleIndex,
    scaleName: resolved ?? null,
  };
}

/**
 * Scale-Name case-insensitiv gegen `VALID_SCALE_NAMES` matchen und den
 * kanonischen 0-basierten Index liefern; Miss → Throw.
 *
 * @param scaleName - Eingegebener Scale-Name.
 * @returns Kanonischer Index in VALID_SCALE_NAMES.
 */
function scaleNameToIndex(scaleName: string): number {
  const lower = scaleName.toLowerCase();
  const idx = VALID_SCALE_NAMES.findIndex((n) => n.toLowerCase() === lower);

  if (idx < 0) {
    throw new Error(`Scale "${scaleName}" nicht in VALID_SCALE_NAMES`);
  }

  return idx;
}

/**
 * Genau ein `<TAG Value="…" />` im Block auf `value` setzen (Replacer-
 * Funktion, kein `$`-Pattern); fehlt der Tag → Throw (kein Teil-Patch).
 *
 * @param block - Der `<ScaleInformation>`-Block.
 * @param tag - Tag-Name ("Root" oder "Name").
 * @param value - Numerischer Zielwert.
 * @returns Block mit ersetztem Tag-Wert.
 */
function patchTag(block: string, tag: string, value: number): string {
  const re = new RegExp(`(<${tag} Value=")[^"]*(")`);

  if (!re.test(block)) {
    throw new Error(`<${tag}>-Tag in <ScaleInformation> fehlt`);
  }

  return block.replace(re, (_m, pre: string, post: string) => {
    return `${pre}${value}${post}`;
  });
}
