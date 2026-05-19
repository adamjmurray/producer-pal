// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Ein Warp-Marker als rohe Attribut-Strings (Float woertlich, kein Reformat). */
export interface WarpMarker {
  secTime: string;
  beatTime: string;
}

/**
 * Die `<WarpMarkers>`-Liste eines AudioClip-Blocks byte-treu durch `markers`
 * ersetzen. Id wird dicht 0..n-1 vergeben, Attribut-Reihenfolge exakt
 * `Id SecTime BeatTime`, Float-Werte WOERTLICH (nie parseFloat/toString).
 *
 * Premortem R1: Der Whitespace-/Indent-Token vor dem ersten `<WarpMarker`
 * (inkl. fuehrendem Newline) und der Whitespace vor `</WarpMarkers>` werden
 * aus dem Original-Match extrahiert und 1:1 wiederverwendet — kein
 * hartkodierter Tab-Count. Wert- und Whitespace-erhaltend; die Id wird
 * dabei auf 0..n-1 normalisiert (renumber-safe, da WarpMarker-Ids nicht
 * quer-referenziert sind), daher ist der Block erst NACH dem ersten Pass
 * byte-stabil (get -> patch -> get -> patch idempotent).
 *
 * @param clipXml - Der `<AudioClip>`-Block als String.
 * @param markers - Ziel-Marker-Liste (>= 2, beatTime strikt monoton steigend).
 * @returns Der Clip-Block mit ersetzter `<WarpMarkers>`-Liste.
 */
export function patchWarpMarkers(
  clipXml: string,
  markers: WarpMarker[],
): string {
  if (!clipXml.startsWith("<AudioClip")) {
    throw new Error("Warp-Marker nur fuer AudioClip (Clip ist kein AudioClip)");
  }

  if (markers.length < 2) {
    throw new Error("Warp-Marker erfordern mindestens 2 Marker (Anker + >= 1)");
  }

  let prev = -Infinity;

  for (const m of markers) {
    const bt = Number(m.beatTime);

    if (Number.isNaN(bt)) {
      throw new Error(`BeatTime ist keine Zahl (Wert "${m.beatTime}")`);
    }

    if (bt <= prev) {
      throw new Error(
        `BeatTime muss strikt monoton steigend sein (Wert "${m.beatTime}")`,
      );
    }

    prev = bt;
  }

  // Close-Whitespace als Capture-Group im Haupt-Match: dieselbe (auf null
  // gepruefte) RegExp-Instanz liefert ihn garantiert mit, daher kein
  // separater optionaler Match und kein unerreichbarer Fallback-Zweig.
  const match = clipXml.match(/<WarpMarkers>[^]*?(\s*)<\/WarpMarkers>/);

  if (match?.index == null) {
    throw new Error("<WarpMarkers>-Block im Clip nicht gefunden");
  }

  const block = match[0];
  const start = match.index;
  const end = start + block.length;
  const lead = block.match(/<WarpMarkers>(\s*)<WarpMarker/);
  const indent = lead?.[1] ?? "\n";
  const closeWs = match[1];
  const body = markers
    .map(
      (m, i) =>
        `${indent}<WarpMarker Id="${i}" SecTime="${m.secTime}" ` +
        `BeatTime="${m.beatTime}" />`,
    )
    .join("");
  const next = `<WarpMarkers>${body}${closeWs}</WarpMarkers>`;

  return clipXml.slice(0, start) + next + clipXml.slice(end);
}

/**
 * Alle `<WarpMarker>` eines Clip-Blocks in Reihenfolge lesen. Liefert die
 * ROHEN Attribut-Strings (Float woertlich, keine Konvertierung). Die im Set
 * vorhandenen Ids koennen beliebig/nicht-dicht sein und werden NICHT gelesen.
 *
 * @param clipXml - Der `<AudioClip>`-Block (oder Teil-XML) als String.
 * @returns Marker-Liste in Dokumentreihenfolge.
 */
export function getWarpMarkers(clipXml: string): WarpMarker[] {
  const re = /<WarpMarker Id="\d+" SecTime="([^"]*)" BeatTime="([^"]*)" \/>/g;
  const markers: WarpMarker[] = [];

  for (const [, secTime = "", beatTime = ""] of clipXml.matchAll(re)) {
    // Beide Capture-Groups sind im Regex Pflicht ([^"]*), daher liefert ein
    // Match sie stets mit; die Defaults erfuellen nur noUncheckedIndexedAccess
    // und erzeugen keinen erreichbaren Fallback-Zweig.
    markers.push({ secTime, beatTime });
  }

  return markers;
}
