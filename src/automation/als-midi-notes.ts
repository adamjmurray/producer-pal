// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Eine MidiNote als ausgewertete Zahlen (Beats, MIDI-Bereiche). */
export interface AlsMidiNote {
  pitch: number;
  startBeats: number;
  durationBeats: number;
  velocity: number;
  offVelocity: number;
}

/**
 * Notendaten eines MidiClip-Blocks auswerten. Liefert pro KeyTrack die
 * `<MidiKey>`-Pitch und alle `<MidiNoteEvent>`-Noten sowie die Clip-Time-
 * Signature. Reines `.als`-Lesen — die rohen Zahl-Strings werden NUR hier
 * kontrolliert (mit NaN-Guard) in `number` ueberfuehrt.
 *
 * Lehre Modulation/Warp: jeder KeyTrack wird eng KeyTrack-gebunden gescannt
 * (`<KeyTrack ...>…</KeyTrack>` als nicht-gieriger Block, MidiKey/Noten NUR
 * innerhalb dieses Blocks) — kein ungebundener Lazy-Match ueber Element-
 * grenzen, kein stilles Cross-Element-Mis-Target.
 *
 * @param clipXml - Der `<MidiClip>`-Block als String.
 * @returns Noten in Dokumentreihenfolge plus `{ num, den }` Time-Signature.
 * @throws {Error} Wenn der Block kein MidiClip ist oder ein Attribut keine Zahl.
 */
export function extractMidiNotes(clipXml: string): {
  notes: AlsMidiNote[];
  timeSig: { num: number; den: number };
} {
  if (!clipXml.startsWith("<MidiClip")) {
    throw new Error("MIDI-Export nur fuer MidiClip (Clip ist kein MidiClip)");
  }

  const notes: AlsMidiNote[] = [];
  const keyTrackRe = /<KeyTrack\b[^]*?<\/KeyTrack>/g;

  for (const [block] of clipXml.matchAll(keyTrackRe)) {
    const keyMatch = block.match(/<MidiKey Value="([^"]*)" \/>/);

    if (keyMatch == null) {
      throw new Error("KeyTrack ohne <MidiKey> — ungueltiges .als-Format");
    }

    const pitch = toMidiByte(toNumber(keyMatch[1], "MidiKey"), "MidiKey");
    const noteRe = /<MidiNoteEvent\b([^>]*)\/>/g;

    // Die Attribut-Capture-Group ([^>]*) ist Pflicht — ein Match liefert sie
    // stets; der "" -Default erfuellt nur noUncheckedIndexedAccess (R5).
    for (const [, attrs = ""] of block.matchAll(noteRe)) {
      notes.push(parseNote(attrs, pitch));
    }
  }

  return { notes, timeSig: parseTimeSig(clipXml) };
}

/**
 * Globales Set-Tempo (BPM) aus dem Voll-XML lesen: erstes
 * `<Tempo>`…`<Manual Value="…" />`. Eng gebunden, fehlt es oder ist es
 * nicht numerisch -> Klartext-Throw (kein stiller Default).
 *
 * @param xml - Das vollstaendige (dekomprimierte) `.als`-XML.
 * @returns Tempo in BPM als Zahl.
 * @throws {Error} Wenn kein `<Tempo><Manual>` existiert oder NaN.
 */
export function getGlobalTempoBpm(xml: string): number {
  const m = xml.match(/<Tempo>[^]*?<Manual Value="([\d.]+)" \/>/);

  if (m == null) {
    throw new Error("Globales Tempo (<Tempo><Manual>) nicht gefunden");
  }

  return toNumber(m[1], "Tempo");
}

/**
 * Die vier benoetigten Attribute eines `<MidiNoteEvent>` gezielt greifen
 * (Reihenfolge im Tag ist nicht garantiert — daher pro Attribut eine eng
 * gebundene Regex statt Positions-Annahme).
 *
 * @param attrs - Attribut-String zwischen `<MidiNoteEvent` und `/>`.
 * @param pitch - MIDI-Pitch des umgebenden KeyTracks.
 * @returns Die ausgewertete Note.
 * @throws {Error} Wenn ein Pflichtattribut fehlt oder keine Zahl ist.
 */
function parseNote(attrs: string, pitch: number): AlsMidiNote {
  return {
    pitch,
    startBeats: toNumber(attr(attrs, "Time"), "Time"),
    durationBeats: toNumber(attr(attrs, "Duration"), "Duration"),
    velocity: toMidiByte(
      toNumber(attr(attrs, "Velocity"), "Velocity"),
      "Velocity",
    ),
    offVelocity: toMidiByte(
      toNumber(attr(attrs, "OffVelocity"), "OffVelocity"),
      "OffVelocity",
    ),
  };
}

/**
 * Den Wert genau eines benannten Attributs aus einem Attribut-String holen.
 * @param attrs - Attribut-String.
 * @param name - Attributname (z. B. "Velocity").
 * @returns Roher Attributwert oder `null` wenn nicht vorhanden.
 */
function attr(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));

  if (m == null) return null;

  // Die Capture-Group ([^"]*) ist im Regex Pflicht — ein Match liefert sie
  // stets mit; der Default erfuellt nur noUncheckedIndexedAccess und ist
  // kein erreichbarer Fallback-Zweig (R5).
  const [, value = ""] = m;

  return value;
}

/**
 * Time-Signature aus dem Clip-`<TimeSignature>` lesen (erstes
 * `<Numerator>/<Denominator>`-Paar). NaN/fehlt -> Throw.
 * @param clipXml - Der MidiClip-Block.
 * @returns `{ num, den }`.
 * @throws {Error} Wenn Numerator/Denominator fehlt oder keine Zahl.
 */
function parseTimeSig(clipXml: string): { num: number; den: number } {
  const numMatch = clipXml.match(/<Numerator Value="([^"]*)" \/>/);
  const denMatch = clipXml.match(/<Denominator Value="([^"]*)" \/>/);

  if (numMatch == null || denMatch == null) {
    throw new Error("Clip-<TimeSignature> (Numerator/Denominator) fehlt");
  }

  return {
    num: toNumber(numMatch[1], "Numerator"),
    den: toNumber(denMatch[1], "Denominator"),
  };
}

/**
 * Einen rohen Attribut-String streng in eine endliche Zahl wandeln. Dies ist
 * die EINZIGE `Number()`-Stelle des Moduls (kontrollierter NaN-Guard).
 *
 * @param raw - Roher String (oder `null` wenn Attribut fehlte).
 * @param label - Attributname fuer die Fehlermeldung.
 * @returns Die geparste endliche Zahl.
 * @throws {Error} Wenn `raw` fehlt oder keine endliche Zahl ergibt.
 */
function toNumber(raw: string | null | undefined, label: string): number {
  if (raw == null || raw === "") {
    throw new Error(`Attribut "${label}" fehlt im .als`);
  }

  const n = Number(raw);

  if (!Number.isFinite(n)) {
    throw new Error(`Attribut "${label}" ist keine Zahl (Wert "${raw}")`);
  }

  return n;
}

/**
 * Eine bereits endliche Zahl auf den ganzzahligen MIDI-Byte-Bereich 0..127
 * pruefen (pitch/velocity/offVelocity). Out-of-range erzeugte sonst ein
 * malformes `90 pp vv`-SMF, das der wert-gebundene Verify evtl. nicht
 * zuverlaessig faengt — daher harter Klartext-Throw analog zum NaN-Guard.
 *
 * @param n - Bereits via `toNumber` validierte endliche Zahl.
 * @param label - Attributname fuer die Fehlermeldung.
 * @returns Dieselbe Zahl, wenn ganzzahlig in 0..127.
 * @throws {Error} Wenn ausserhalb 0..127 oder nicht ganzzahlig.
 */
function toMidiByte(n: number, label: string): number {
  if (!Number.isInteger(n) || n < 0 || n > 127) {
    throw new Error(
      `Attribut "${label}" ausserhalb MIDI-Bereich 0..127 (Wert "${n}")`,
    );
  }

  return n;
}
