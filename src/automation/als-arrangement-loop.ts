// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Zu patchende Arrangement-Loop-Felder (nur uebergebene werden gesetzt). */
export interface ArrLoopPatch {
  on?: boolean;
  start?: string;
  length?: string;
}

/** Gelesener Arrangement-Loop-Zustand aus dem eindeutigen `<Transport>`. */
export interface ArrLoop {
  on: boolean;
  start: string;
  length: string;
}

/**
 * Den (build-belegt eindeutigen, genau 1×/Set) `<Transport>`-Block byte-treu
 * auf die uebergebenen Loop-Felder patchen. `<LoopOn>`/`<LoopStart>`/
 * `<LoopLength>` werden ATOMAR per gezieltem Attr-Replace (Replacer-Funktion,
 * kein `$`-Pattern) STRIKT im `<Transport>`-Block ersetzt — Clip-`<Loop>`-
 * Bloecke (LoopEnd-Seite) bleiben unberuehrt. Leere Patch-Menge, fehlender
 * `<Transport>`-Block oder ein fehlendes zu patchendes Ziel-Tag → Throw
 * (kein Teil-Patch).
 *
 * @param xml - Roher (dekomprimierter) `.als`-XML-String.
 * @param patch - Zu setzende Felder; `on` → "true"/"false", `start`/`length`
 *   als String woertlich (kein Float-Reformat).
 * @returns Das XML mit ausschliesslich im `<Transport>` ersetzten Loop-Werten.
 */
export function patchArrangementLoop(xml: string, patch: ArrLoopPatch): string {
  const { on, start, length } = patch;

  if (on == null && start == null && length == null) {
    throw new Error("arrangement-loop: leere Patch-Menge (kein Feld gesetzt)");
  }

  const match = xml.match(/<Transport>[\S\s]*?<\/Transport>/);

  if (match?.index == null) {
    throw new Error("<Transport>-Block nicht gefunden");
  }

  const block = match[0];
  const blockStart = match.index;
  const blockEnd = blockStart + block.length;
  let patched = block;

  if (on != null) {
    patched = patchTag(patched, "LoopOn", on ? "true" : "false");
  }

  if (start != null) {
    patched = patchTag(patched, "LoopStart", start);
  }

  if (length != null) {
    patched = patchTag(patched, "LoopLength", length);
  }

  return xml.slice(0, blockStart) + patched + xml.slice(blockEnd);
}

/**
 * Loop-Zustand aus dem eindeutigen `<Transport>`-Block lesen. KEIN Throw:
 * fehlt der Block oder ein Tag, liefert das jeweilige Feld einen
 * konsistenten Default (`on:false`, `""`) — Lehre `getClipScale`.
 *
 * @param xml - Roher (dekomprimierter) `.als`-XML-String.
 * @returns `{ on, start, length }` (Beats roh als String, `on` als bool).
 */
export function getArrangementLoop(xml: string): ArrLoop {
  const match = xml.match(/<Transport>[\S\s]*?<\/Transport>/);
  const block = match == null ? "" : match[0];

  return {
    on: readTag(block, "LoopOn") === "true",
    start: readTag(block, "LoopStart"),
    length: readTag(block, "LoopLength"),
  };
}

/**
 * Genau ein `<TAG Value="…" />` im `<Transport>`-Block auf `value` setzen
 * (Replacer-Funktion, kein `$`-Pattern); fehlt der Tag → Throw (kein
 * Teil-Patch).
 *
 * @param block - Der `<Transport>`-Block.
 * @param tag - Tag-Name (`LoopOn`/`LoopStart`/`LoopLength`).
 * @param value - Woertlicher Zielwert ("true"/"false" bzw. Beats-String).
 * @returns Block mit ersetztem Tag-Wert.
 */
function patchTag(block: string, tag: string, value: string): string {
  const re = new RegExp(`(<${tag} Value=")[^"]*(")`);

  if (!re.test(block)) {
    throw new Error(`<${tag}>-Tag im <Transport>-Block fehlt`);
  }

  return block.replace(re, (_m, pre: string, post: string) => {
    return `${pre}${value}${post}`;
  });
}

/**
 * Roh-Value-String eines `<TAG Value="…" />` aus dem Block lesen; fehlt der
 * Tag (oder ist der Block leer), Default `""` (kein Throw).
 *
 * @param block - Der `<Transport>`-Block (ggf. leer).
 * @param tag - Tag-Name (`LoopOn`/`LoopStart`/`LoopLength`).
 * @returns Roher Value-String oder `""`.
 */
function readTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag} Value="([^"]*)"`));

  if (m == null) return "";

  // Capture-Group 1 ist Pflicht ([^"]*) -> bei einem Match stets gesetzt
  // (ggf. leer); der noUncheckedIndexedAccess-Destrukturierungs-Default
  // bleibt unerreichbar (kein toter Laufzeit-Zweig — fehlender Tag wird
  // bereits durch das m==null-Guard oben gedeckt). Lehre getClipScale.
  const [, value = ""] = m;

  return value;
}
