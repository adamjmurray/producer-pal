// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Ein Groove-Pool-Eintrag (lesbare Felder). */
export interface GrooveEntry {
  /** `<Groove Id="N">`-Attribut. */
  id: string;
  /** `<Name Value>` des Eintrags (NICHT des eingebetteten MidiClip). */
  name: string;
  Grid: string;
  QuantizationAmount: string;
  TimingAmount: string;
  RandomAmount: string;
  VelocityAmount: string;
}

interface GrooveTuneDef {
  tag: string;
  type: "int";
}

/**
 * Setbare Groove-Amount-Keys (genau 5). Recon: alle ganzzahlig (0/3/100).
 * Grid ist ebenfalls ganzzahlig kodiert.
 */
export const GROOVE_TUNE_SPEC: Record<string, GrooveTuneDef> = {
  Grid: { tag: "Grid", type: "int" },
  QuantizationAmount: { tag: "QuantizationAmount", type: "int" },
  TimingAmount: { tag: "TimingAmount", type: "int" },
  RandomAmount: { tag: "RandomAmount", type: "int" },
  VelocityAmount: { tag: "VelocityAmount", type: "int" },
};

/**
 * Open-Tag-Pattern für Pool-Einträge (Pattern-String, KEIN /g-RegExp).
 * `grooveEntriesRaw` baут je Scan eine frische `new RegExp(..., "g")` aus
 * diesem String — so existiert kein geteilter `lastIndex`-State und keine
 * Dead-Complexity einer nie direkt genutzten /g-Modul-Konstante.
 */
const GROOVE_OPEN_PATTERN = String.raw`<Groove Id="(\d+)">`;

/**
 * Listet alle Groove-Pool-Einträge mit Id, Name und den 5 Amount-Werten.
 *
 * R-B (Anpassung A): Der `name` wird AUSSCHLIESSLICH aus dem Substring
 * zwischen Eintrags-`<LomId` und dem ERSTEN `<Clip>` (vor dem eingebetteten
 * MidiClip) extrahiert — so kann ein eingebetteter `<MidiClip><Name Value>`
 * den Groove-Namen niemals überschreiben. Die Amount-Tags stehen hinter dem
 * eingebetteten Clip und werden im Substring NACH dem ERSTEN `</Clip>`
 * gelesen.
 *
 * Robustheit (FIX 2): Fehlt der eingebettete `<Clip>` (kein `</Clip>` im
 * Block), wird der gesamte Eintrags-Block (nach dem Namen) als Amount-Such-
 * bereich genutzt — NICHT `block.slice(-1)` (stilles Fehlverhalten, alle
 * Amounts ""). Der Name wird dann aus dem Bereich nach `<LomId` bis zum
 * ersten Amount-Tag bzw. Block-Ende gelesen.
 *
 * @param xml - .als-XML (oder GroovePool-Substring).
 * @returns Liste der Pool-Einträge in Dokumentreihenfolge ([] bei leerem Pool).
 */
export function listGrooves(xml: string): GrooveEntry[] {
  return grooveEntriesRaw(xml).map(({ id, block }) => {
    const name = extractEntryName(block);
    const clipEndIdx = block.indexOf("</Clip>");
    const afterClip = clipEndIdx === -1 ? block : block.slice(clipEndIdx);

    return {
      id,
      name,
      Grid: scalarOrEmpty(afterClip, "Grid"),
      QuantizationAmount: scalarOrEmpty(afterClip, "QuantizationAmount"),
      TimingAmount: scalarOrEmpty(afterClip, "TimingAmount"),
      RandomAmount: scalarOrEmpty(afterClip, "RandomAmount"),
      VelocityAmount: scalarOrEmpty(afterClip, "VelocityAmount"),
    };
  });
}

/**
 * Liefert die Ids aller Pool-Einträge in Dokumentreihenfolge.
 * @param xml - .als-XML (oder GroovePool-Substring).
 * @returns Array der Groove-Ids ([] bei leerem Pool).
 */
export function poolGrooveIds(xml: string): string[] {
  return grooveEntriesRaw(xml).map((e) => e.id);
}

/**
 * Lokalisiert den `<Groove Id="id">…</Groove>`-Block (absolute Offsets in
 * `xml`). Nicht-backtrackend: Open-Tag-Regex + `indexOf("</Groove>")` — der
 * eingebettete `<MidiClip>` enthält kein `</Groove>`, daher ist das erste
 * `</Groove>` nach dem Open-Tag das korrekte.
 *
 * @param xml - .als-XML (oder GroovePool-Substring).
 * @param id - Gesuchte Groove-Id.
 * @returns Start-/End-Offset und der Block-String.
 * @throws {Error} Wenn die Id nicht im Pool ist (mit verfügbaren Ids).
 */
export function locateGrooveEntry(
  xml: string,
  id: string,
): { start: number; end: number; block: string } {
  const open = `<Groove Id="${id}">`;
  const start = xml.indexOf(open);

  if (start === -1) {
    throw new Error(
      `Groove-Id "${id}" nicht im Pool. Verfügbar: ${poolGrooveIds(xml).join(", ")}`,
    );
  }

  const closeIdx = xml.indexOf("</Groove>", start + open.length);

  if (closeIdx === -1) {
    throw new Error(
      `unerwartetes .als-Format: <Groove Id="${id}"> nicht geschlossen`,
    );
  }

  const end = closeIdx + "</Groove>".length;

  return { start, end, block: xml.slice(start, end) };
}

/**
 * Patcht genau einen Amount-Tag eines existierenden Pool-Eintrags. Der Tag
 * wird AUSSCHLIESSLICH im Eintrags-Fenster NACH `</Clip>` (bis `</Groove>`)
 * ersetzt — verhindert Treffer im eingebetteten MidiClip (z. B. dessen
 * `<GrooveId>`). Exakt-1-Treffer-Guard.
 *
 * @param xml - .als-XML (oder GroovePool-Substring).
 * @param id - Ziel-Groove-Id (muss im Pool sein).
 * @param key - Einer der 5 Keys aus `GROOVE_TUNE_SPEC`.
 * @param value - Neuer Wert (Integer-validiert).
 * @returns Das XML mit genau einem ersetzten Tag-Wert.
 * @throws {Error} Bei unbekanntem Key, ungültigem Wert oder fehlender Id.
 */
export function patchGrooveTune(
  xml: string,
  id: string,
  key: string,
  value: string,
): string {
  const def = GROOVE_TUNE_SPEC[key];

  if (def === undefined) {
    throw new Error(
      `Unbekannter Key "${key}". Gültig: ${Object.keys(GROOVE_TUNE_SPEC).join(", ")}`,
    );
  }

  // Recon: alle Amounts/Grid sind nicht-negativ (0/3/100), Grid enum-artig.
  // Negative Werte, Floats, leer und nicht-numerisches werden abgelehnt.
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Key "${key}" erwartet nicht-negativen Integer (ganzzahl), nicht "${value}"`,
    );
  }

  const loc = locateGrooveEntry(xml, id);
  const clipEndRel = loc.block.indexOf("</Clip>");

  if (clipEndRel === -1) {
    throw new Error(
      `unerwartetes .als-Format: kein <Clip> in <Groove Id="${id}">`,
    );
  }

  const windowStart = clipEndRel + "</Clip>".length;
  const win = loc.block.slice(windowStart);
  const tagRe = new RegExp(`(<${def.tag} Value=")[^"]*(" />)`, "g");
  const hits = win.match(tagRe);

  if (hits === null) {
    throw new Error(
      `Tag <${def.tag}> im Groove-Eintrag (nach <Clip>) nicht gefunden`,
    );
  }

  if (hits.length !== 1) {
    throw new Error(
      `Tag <${def.tag}> ${hits.length}-mal im Groove-Eintrag — mehrdeutig`,
    );
  }

  let replaced = 0;
  const patchedWin = win.replaceAll(tagRe, (_m, pre: string, post: string) => {
    replaced += 1;

    return `${pre}${value}${post}`;
  });

  if (replaced !== 1) {
    throw new Error(
      `Replace-Konsistenzfehler für <${def.tag}>: Guard erwartete 1, ` +
        `Replace ersetzte ${replaced}`,
    );
  }

  const patchedBlock = loc.block.slice(0, windowStart) + patchedWin;

  return xml.slice(0, loc.start) + patchedBlock + xml.slice(loc.end);
}

/**
 * Setzt die Clip-`<GrooveId>` ausschließlich im `<GrooveSettings>…
 * </GrooveSettings>`-Scope. Exakt-1-Treffer-Guard. Pool-Konsistenz
 * (`-1` oder ∈ poolIds) wird im CLI-Handler (T2) geprüft.
 *
 * @param clipXml - Der Clip-XML-Block.
 * @param grooveId - `-1` (lösen) oder eine ganzzahlige Pool-Id. Muss ein
 *   sicherer Integer sein (`Number.isSafeInteger`) — astronomisch große Ids
 *   (Precision-Loss) werden abgelehnt.
 * @returns Der Clip-Block mit genau einem ersetzten `<GrooveId>`-Wert.
 * @throws {Error} Bei nicht-ganzzahliger / nicht-safe-integer Id oder
 *   fehlendem GrooveSettings/GrooveId.
 */
export function setClipGrooveId(clipXml: string, grooveId: string): string {
  if (!/^-?\d+$/.test(grooveId) || !Number.isSafeInteger(Number(grooveId))) {
    throw new Error(
      `GrooveId erwartet sicheren Integer (ganzzahl), nicht "${grooveId}"`,
    );
  }

  const gsM = clipXml.match(/<GrooveSettings>[^]*?<\/GrooveSettings>/);

  if (gsM?.index === undefined) {
    throw new Error("kein <GrooveSettings>-Scope im Clip");
  }

  const gsStart = gsM.index;
  const gsEnd = gsStart + gsM[0].length;
  const tagRe = /(<GrooveId Value=")[^"]*(" \/>)/g;
  const hits = gsM[0].match(tagRe);

  if (hits === null) {
    throw new Error("<GrooveId> im <GrooveSettings>-Scope nicht gefunden");
  }

  if (hits.length !== 1) {
    throw new Error(
      `<GrooveId> ${hits.length}-mal im <GrooveSettings>-Scope — mehrdeutig`,
    );
  }

  let replaced = 0;
  const patchedGs = gsM[0].replaceAll(
    tagRe,
    (_m, pre: string, post: string) => {
      replaced += 1;

      return `${pre}${grooveId}${post}`;
    },
  );

  if (replaced !== 1) {
    throw new Error(
      `Replace-Konsistenzfehler für <GrooveId>: Guard erwartete 1, ` +
        `Replace ersetzte ${replaced}`,
    );
  }

  return clipXml.slice(0, gsStart) + patchedGs + clipXml.slice(gsEnd);
}

/**
 * Sammelt alle Pool-Einträge als {id, block} (nicht-backtrackend).
 * `<Grooves />` (self-closing) → []. Pro Open-Tag wird das erste
 * `</Groove>` via `indexOf` als Block-Ende genutzt.
 *
 * @param xml - .als-XML (oder GroovePool-Substring).
 * @returns Liste {id, block} in Dokumentreihenfolge.
 */
function grooveEntriesRaw(xml: string): { id: string; block: string }[] {
  const poolM = xml.match(/<GroovePool>[^]*?<\/GroovePool>/);
  const pool = poolM ? poolM[0] : xml;
  // Self-closing oder fehlendes <Grooves> -> kein Eintrag.
  const groovesOpen = pool.indexOf("<Grooves>");

  if (groovesOpen === -1) return [];

  const groovesClose = pool.indexOf("</Grooves>", groovesOpen);
  const scope =
    groovesClose === -1
      ? pool.slice(groovesOpen)
      : pool.slice(groovesOpen, groovesClose);
  const openRe = new RegExp(GROOVE_OPEN_PATTERN, "g");
  const out: { id: string; block: string }[] = [];
  let m: RegExpExecArray | null;

  while ((m = openRe.exec(scope)) !== null) {
    const id = m[1];

    if (id == null) {
      throw new Error("unerwartetes .als-Format: <Groove Id> ohne Id");
    }

    const start = m.index;
    const closeIdx = scope.indexOf("</Groove>", start + m[0].length);

    if (closeIdx === -1) {
      throw new Error(
        `unerwartetes .als-Format: <Groove Id="${id}"> nicht geschlossen`,
      );
    }

    const end = closeIdx + "</Groove>".length;

    openRe.lastIndex = end;
    out.push({ id, block: scope.slice(start, end) });
  }

  return out;
}

/**
 * R-B: Extrahiert den Groove-Namen AUSSCHLIESSLICH aus dem Substring
 * zwischen Eintrags-`<LomId` und dem ERSTEN `<Clip>` (vor dem eingebetteten
 * MidiClip).
 *
 * FIX 2: Fehlt der eingebettete `<Clip>`, wird die obere Fenstergrenze auf
 * das Block-Ende gesetzt (statt "" zurückzugeben). Da der Groove-`<Name>`
 * direkt nach `<LomId>` und vor den Amount-Tags steht, liefert der erste
 * `<Name Value>`-Treffer weiterhin korrekt den Eintrags-Namen.
 *
 * @param block - Der `<Groove …>…</Groove>`-Block.
 * @returns Der Groove-Name (leerer String, wenn nicht vorhanden).
 */
function extractEntryName(block: string): string {
  const lomIdx = block.indexOf("<LomId");

  if (lomIdx === -1) return "";
  const clipIdx = block.indexOf("<Clip>");
  const upper = clipIdx === -1 || clipIdx <= lomIdx ? block.length : clipIdx;
  const window = block.slice(lomIdx, upper);
  const nameM = window.match(/<Name Value="([^"]*)" \/>/);

  return nameM?.[1] ?? "";
}

/**
 * Liest `<tag Value="…" />` aus einem Substring oder "" wenn fehlend.
 * @param hay - Der zu durchsuchende Substring.
 * @param tag - Tag-Name.
 * @returns Der Attributwert oder "".
 */
function scalarOrEmpty(hay: string, tag: string): string {
  const m = hay.match(new RegExp(`<${tag} Value="([^"]*)" />`));

  return m?.[1] ?? "";
}
