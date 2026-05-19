// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Ein Arrangement-Clip als rohe Attribut-Strings + abgeleitete Span-Werte. */
export interface ArrClip {
  id: string;
  time: string;
  startBeat: number;
  spanEnd: number;
}

/**
 * Den Arrangement-Events-Scope eines Track-Blocks isolieren. Anker ist der
 * `<MainSequencer>…</MainSequencer>`-Subblock (NICHT `<ClipTimeable>`): das
 * deckt MIDI- UND Audio-Tracks ab, da AudioTracks zwar kein `<ClipTimeable>`,
 * aber sehr wohl genau ein `<ArrangerAutomation>` im MainSequencer haben
 * (build-verifiziert 2026-05-19). Innerhalb des Subblocks wird das ERSTE
 * `<ArrangerAutomation>` gewaehlt und dessen direktes Kind-`<Events>` per
 * Tiefenzaehlung bis zum KORRESPONDIERENDEN `</Events>` abgegrenzt.
 *
 * Strukturannahme (getestet, I1): `<ArrangerAutomation>` hat genau ein
 * direktes `<Events>…</Events>` als Kind; verschachtelte `<Events>` eines
 * Clip-Bodies (z.B. `<Envelopes><Automation><Events>` mit Float-/Clip-
 * Punkten) erhoehen die Tiefe und enden VOR dem aeusseren `</Events>`, daher
 * wird der Scope am korrekten aeusseren `</Events>` geschlossen statt am
 * ersten inneren — kein nested-`<Events>`-Mis-Target mehr.
 *
 * Freeze-sicher: `<FreezeSequencer>` (mit eigener `<ArrangerAutomation>`)
 * liegt in Dokumentordnung IMMER NACH `</MainSequencer>` (build-verifiziert
 * fuer beide Track-Typen) und damit ausserhalb des Subblocks. Session-sicher:
 * Session-ClipSlots liegen vor dem MainSequencer bzw. nicht in dessen
 * ArrangerAutomation. Ein leeres Arrangement ist `<Events />` (selbst-
 * schliessend) und liefert keinen offenen Scope -> null.
 *
 * @param trackBlock - Der vollstaendige Track-Block (von locateTrackBlock).
 * @returns Start-Offset und Inhalt des Events-Scopes, oder null wenn fehlend.
 */
function locateArrangementEventsScope(
  trackBlock: string,
): { start: number; region: string } | null {
  const msStart = trackBlock.indexOf("<MainSequencer>");
  const msEnd = trackBlock.indexOf("</MainSequencer>");

  if (msStart < 0 || msEnd < 0 || msEnd < msStart) {
    return null;
  }

  const msEndAbs = msEnd + "</MainSequencer>".length;
  const subblock = trackBlock.slice(msStart, msEndAbs);
  const aaIdx = subblock.indexOf("<ArrangerAutomation>");

  if (aaIdx < 0) {
    return null;
  }

  const scope = scopeArrangerEvents(subblock, aaIdx);

  if (scope == null) {
    return null;
  }

  return {
    start: msStart + scope.start,
    region: subblock.slice(scope.start, scope.end),
  };
}

/**
 * Ab dem `<ArrangerAutomation>` bei `aaIdx` das erste direkte Kind-`<Events>`
 * suchen und per Tag-Tiefenzaehlung das korrespondierende `</Events>`
 * (Tiefe 0) bestimmen. Selbstschliessende `<Events />` (leeres Arrangement)
 * werden uebersprungen und oeffnen keinen Scope. Liefert die Offsets des
 * Events-INHALTS (zwischen `<Events>` und `</Events>`) relativ zum
 * uebergebenen `subblock`.
 *
 * @param subblock - Der `<MainSequencer>…</MainSequencer>`-Subblock.
 * @param aaIdx - Offset des `<ArrangerAutomation>` im Subblock.
 * @returns Start/Ende des Events-Inhalts, oder null wenn kein offener Scope.
 */
function scopeArrangerEvents(
  subblock: string,
  aaIdx: number,
): { start: number; end: number } | null {
  const re = /<Events>|<\/Events>|<Events\s*\/>/g;

  re.lastIndex = aaIdx;

  let depth = 0;
  let started = false;
  let contentStart = -1;
  let m: RegExpExecArray | null;

  while ((m = re.exec(subblock)) != null) {
    const tag = m[0];

    if (tag.endsWith("/>")) {
      continue;
    }

    if (tag === "<Events>") {
      if (!started) {
        started = true;
        contentStart = re.lastIndex;
      }

      depth += 1;
      continue;
    }

    depth -= 1;

    if (started && depth === 0) {
      return { start: contentStart, end: m.index };
    }
  }

  return null;
}

/**
 * Span-Ende eines Clips aus dem ERSTEN `<CurrentStart Value=…/>` /
 * `<CurrentEnd Value=…/>` des Clip-Blocks ableiten. Fehlt eines (oder ist
 * keine Zahl) → +Infinity, damit der Spanning-Guard konservativ greift und
 * nichts still durchgewunken wird (R6).
 *
 * @param clipChunk - Der Clip-Block ab dem Opening-Tag bis vor dem naechsten.
 * @param startBeat - Numerischer Time-Wert des Clips.
 * @returns Span-Ende in Beats oder +Infinity bei fehlender Span-Info.
 */
function clipSpanEnd(clipChunk: string, startBeat: number): number {
  const csMatch = clipChunk.match(/<CurrentStart Value="([^"]*)"\s*\/>/);
  const ceMatch = clipChunk.match(/<CurrentEnd Value="([^"]*)"\s*\/>/);

  if (csMatch == null || ceMatch == null) {
    return Number.POSITIVE_INFINITY;
  }

  const curStart = Number(csMatch[1]);
  const curEnd = Number(ceMatch[1]);

  if (Number.isNaN(curStart) || Number.isNaN(curEnd)) {
    return Number.POSITIVE_INFINITY;
  }

  return startBeat + Math.max(0, curEnd - curStart);
}

/**
 * Alle direkten Arrangement-Clips einer Spur in Dokumentreihenfolge lesen.
 * Nur Opening-Tags `<MidiClip Id Time>` / `<AudioClip Id Time>` DIREKT im
 * MainSequencer/ClipTimeable/ArrangerAutomation/Events-Scope; verschachtelte
 * `<Events>` eines Clips (KeyTracks/Envelopes) werden NICHT rekursiv erfasst,
 * da der span-Chunk am naechsten Clip-Opening (oder Scope-Ende) endet.
 *
 * @param trackBlock - Der vollstaendige Track-Block (von locateTrackBlock).
 * @returns Arr-Clip-Liste (leer wenn kein Arrangement-Scope/keine Clips).
 */
export function getArrangementClips(trackBlock: string): ArrClip[] {
  const scope = locateArrangementEventsScope(trackBlock);

  if (scope == null) {
    return [];
  }

  const region = scope.region;
  const re = /<(?:Midi|Audio)Clip Id="(\d+)" Time="([^"]*)">/g;
  // Erst die Opening-Tags als typisierte Records sammeln (Index/Id/Time
  // selbst gesetzt, kein RegExpMatchArray-Index-Undefined). Der Span-Chunk
  // eines Clips reicht bis zum NAECHSTEN Opening (oder Scope-Ende), wodurch
  // verschachteltes `<Events>` eines Clips ausserhalb des Chunks bleibt.
  const opens = [...region.matchAll(re)].map((m) => {
    const { 1: id = "", 2: time = "" } = m;

    return { start: m.index, id, time };
  });

  return opens.map((o, i) => {
    const nextStart = opens[i + 1]?.start ?? region.length;
    const chunk = region.slice(o.start, nextStart);
    const startBeat = Number(o.time);

    return {
      id: o.id,
      time: o.time,
      startBeat,
      spanEnd: clipSpanEnd(chunk, startBeat),
    };
  });
}

/**
 * Numerische Beat-Position deterministisch formatieren. `String(n)` erfuellt
 * den Byte-Kontrakt bereits exakt: ganzzahlige Werte erscheinen OHNE
 * Dezimalpunkt (`String(40)` -> `"40"`, Recon `Time="32"`/`"64"`/`"0"`),
 * nicht-ganzzahlige als JS-Standard (`String(32.5)` -> `"32.5"`). Eine
 * Fallunterscheidung waere ein toter Zweig (R5), daher bewusst keine.
 *
 * @param n - Neuer Beat-Wert (startBeat + delta).
 * @returns Der zu schreibende Time-Attribut-String.
 */
function formatBeat(n: number): string {
  return String(n);
}

/**
 * Arrangement-Clips einer Spur ab `fromBeat` um `delta` verschieben (delta
 * darf negativ sein). Guards werfen VOR jeder Mutation (kein Partial):
 * NaN-Parameter; ein Clip der die Schnittstelle spannt
 * (startBeat < fromBeat && spanEnd > fromBeat); ein zu verschiebender Clip
 * (startBeat >= fromBeat) dessen startBeat+delta < 0 wuerde. Danach werden
 * NUR die `Time="…"`-Attribute der Clips mit startBeat>=fromBeat per
 * gezieltem Offset-Splice ersetzt — unveraenderte Clips, Session-/Freeze-
 * Bereiche und der Rest bleiben byte-identisch.
 *
 * @param trackBlock - Der vollstaendige Track-Block (von locateTrackBlock).
 * @param fromBeat - Schnittstelle P: nur Clips mit startBeat>=P verschieben.
 * @param delta - Verschiebung D in Beats (negativ = zusammenziehen).
 * @returns Neuer Track-Block + Anzahl verschobener Clips.
 */
export function shiftTrackArrangementClips(
  trackBlock: string,
  fromBeat: number,
  delta: number,
): { block: string; shifted: number } {
  if (Number.isNaN(fromBeat) || Number.isNaN(delta)) {
    throw new Error("from-beat und delta muessen Zahlen sein");
  }

  const scope = locateArrangementEventsScope(trackBlock);

  if (scope == null) {
    return { block: trackBlock, shifted: 0 };
  }

  const clips = getArrangementClips(trackBlock);

  for (const c of clips) {
    if (c.startBeat < fromBeat && c.spanEnd > fromBeat) {
      throw new Error(
        `Clip Id="${c.id}" (Time="${c.time}") spannt die Schnittstelle ` +
          `${fromBeat} — kein spekulativer Split, Abbruch`,
      );
    }

    if (c.startBeat >= fromBeat && c.startBeat + delta < 0) {
      throw new Error(
        `Clip Id="${c.id}" (Time="${c.time}") wuerde auf ` +
          `${c.startBeat + delta} < 0 gezogen — Abbruch`,
      );
    }
  }

  return spliceShiftedClips(
    trackBlock,
    scope.start,
    scope.region.length,
    fromBeat,
    delta,
  );
}

/**
 * Die Time-Attribute der zu verschiebenden Clips per absolutem Offset-Splice
 * von hinten nach vorne ersetzen (spaetere Splices verschieben fruehere
 * Offsets nicht). Nur betroffene Bytes aendern sich.
 *
 * @param trackBlock - Der vollstaendige Track-Block.
 * @param scopeStart - Absoluter Offset des Events-Inhalts im trackBlock.
 * @param scopeLen - Laenge des Events-Inhalts (Scope-Ende = Start+Laenge).
 * @param fromBeat - Schnittstelle P.
 * @param delta - Verschiebung D.
 * @returns Neuer Track-Block + Anzahl verschobener Clips.
 */
function spliceShiftedClips(
  trackBlock: string,
  scopeStart: number,
  scopeLen: number,
  fromBeat: number,
  delta: number,
): { block: string; shifted: number } {
  // Nur der Events-INHALT [scopeStart, scopeStart+scopeLen) — nicht bis
  // Blockende. So bleiben nested `<…Clip Id Time>` in Clip-Envelopes (I1)
  // sowie alles nach `</Events>` (FreezeSequencer u.a.) unangetastet,
  // konsistent mit getArrangementClips.
  const region = trackBlock.slice(scopeStart, scopeStart + scopeLen);
  const re = /<((?:Midi|Audio)Clip Id="\d+" Time=)"([^"]*)">/g;
  const edits: { at: number; len: number; next: string }[] = [];

  for (const m of region.matchAll(re)) {
    const { 0: full, 1: head = "", 2: time = "" } = m;
    const startBeat = Number(time);

    if (startBeat < fromBeat) {
      continue;
    }

    const replacement = `<${head}"${formatBeat(startBeat + delta)}">`;

    edits.push({
      at: scopeStart + m.index,
      len: full.length,
      next: replacement,
    });
  }

  let block = trackBlock;

  // Von hinten nach vorne splicen (spaetere Splices verschieben fruehere
  // Offsets nicht). `reverse()` + for-of vermeidet einen unerreichbaren
  // Index-Undefined-Zweig (R5).
  for (const e of [...edits].reverse()) {
    block = block.slice(0, e.at) + e.next + block.slice(e.at + e.len);
  }

  return { block, shifted: edits.length };
}
