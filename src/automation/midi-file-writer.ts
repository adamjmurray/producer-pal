// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Eine Note in absoluten Ticks (PPQ-aufgeloest, ganzzahlig gerundet). */
export interface SmfNote {
  pitch: number;
  startTick: number;
  durationTick: number;
  velocity: number;
  offVelocity: number;
}

/** Vollstaendige Eingabe fuer einen SMF-Type-0-Track (ein Kanal, Channel 0). */
export interface SmfInput {
  ppq: number;
  tempoBpm: number;
  timeSig: { num: number; den: number };
  notes: SmfNote[];
}

/** Ein absolut getakteter MIDI-/Meta-Event vor der Delta-Kodierung. */
interface AbsEvent {
  tick: number;
  /** 0 = Note-Off (vor On bei Tick-Gleichstand), 1 = Note-On / Meta. */
  rank: number;
  pitch: number;
  bytes: number[];
}

/**
 * Eine `SmfInput`-Struktur deterministisch in ein Standard-MIDI-File
 * (Format 0, ein Track) kodieren. Reiner Encoder ohne `.als`-/FS-Bezug.
 *
 * Layout: `MThd` (Format 0, ntrks 1, ppq) gefolgt von `MTrk`. Events werden
 * nach Absolut-Tick total geordnet (Premortem R4): Schluessel
 * (tick ASC, dann Off vor On bei Tick-Gleichstand, dann pitch ASC). Tempo-
 * und TimeSig-Meta stehen @delta0 vor allen Noten; EOT schliesst den Track.
 * Zweimaliges Encoden gleicher Eingabe ist byte-identisch (R1/R2/R4).
 *
 * @param input - PPQ, Tempo (BPM), Time-Signature und Notenliste.
 * @returns Das vollstaendige SMF als Byte-Array.
 */
export function encodeSmf(input: SmfInput): Uint8Array {
  const { ppq, tempoBpm, timeSig, notes } = input;
  const microsPerQuarter = Math.round(60000000 / tempoBpm);
  const denLog2 = Math.round(Math.log2(timeSig.den));
  const events: AbsEvent[] = [
    metaEvent(0, [0xff, 0x51, 0x03, ...uint24(microsPerQuarter)]),
    metaEvent(0, [0xff, 0x58, 0x04, timeSig.num, denLog2, 0x18, 0x08]),
  ];

  for (const n of notes) {
    events.push({
      tick: n.startTick,
      rank: 1,
      pitch: n.pitch,
      bytes: [0x90, n.pitch, n.velocity],
    });
    events.push({
      tick: n.startTick + n.durationTick,
      rank: 0,
      pitch: n.pitch,
      bytes: [0x80, n.pitch, n.offVelocity],
    });
  }

  events.sort(compareEvents);

  const trackBody = encodeDeltaStream(events);

  // EOT folgt @delta0 auf den letzten Event (gleiche Tick-Position).
  trackBody.push(...encodeVlq(0), 0xff, 0x2f, 0x00);

  const header = [
    0x4d,
    0x54,
    0x68,
    0x64,
    0x00,
    0x00,
    0x00,
    0x06,
    0x00,
    0x00,
    0x00,
    0x01,
    ...uint16(ppq),
  ];
  const track = [
    0x4d,
    0x54,
    0x72,
    0x6b,
    ...uint32(trackBody.length),
    ...trackBody,
  ];

  return Uint8Array.from([...header, ...track]);
}

/**
 * Eine vorzeichenlose Zahl als MIDI-Variable-Length-Quantity kodieren
 * (7 Bit pro Byte, High-Bit = "weiteres Byte folgt"). Premortem R2: die
 * haeufigste SMF-Fehlerquelle, daher eigen exportiert + referenzvektor-getestet.
 *
 * @param value - Nicht-negative Ganzzahl (Delta-Tick oder Laenge).
 * @returns Big-Endian-VLQ-Byte-Liste (mindestens ein Byte, auch fuer 0).
 */
export function encodeVlq(value: number): number[] {
  const out = [value & 0x7f];
  let v = Math.floor(value / 128);

  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }

  return out;
}

/**
 * Sortier-Komparator fuer die totale Event-Ordnung (Premortem R4): erst
 * Absolut-Tick, dann Rank (Off vor On bei Gleichstand), dann Pitch.
 *
 * @param a - Linker Event.
 * @param b - Rechter Event.
 * @returns Negativ/0/positiv gemaess Standard-Sortierkonvention.
 */
function compareEvents(a: AbsEvent, b: AbsEvent): number {
  if (a.tick !== b.tick) return a.tick - b.tick;

  if (a.rank !== b.rank) return a.rank - b.rank;

  return a.pitch - b.pitch;
}

/**
 * Sortierte Absolut-Events in einen Delta-kodierten Byte-Strom umwandeln
 * (Delta = aktueller Tick minus vorheriger Tick, als VLQ vorangestellt).
 *
 * @param events - Bereits total geordnete Event-Liste.
 * @returns Flacher Byte-Strom (ohne EOT).
 */
function encodeDeltaStream(events: AbsEvent[]): number[] {
  const out: number[] = [];
  let prevTick = 0;

  for (const e of events) {
    out.push(...encodeVlq(e.tick - prevTick), ...e.bytes);
    prevTick = e.tick;
  }

  return out;
}

/**
 * Einen Meta-Event mit fester Tick-Position und Rank 1 erzeugen.
 *
 * @param tick - Absolute Tick-Position (Meta-Events stehen bei 0).
 * @param bytes - Roh-Bytes des Meta-Events (inkl. `FF`-Statusbyte).
 * @returns Der gekapselte `AbsEvent`.
 */
function metaEvent(tick: number, bytes: number[]): AbsEvent {
  return { tick, rank: 1, pitch: -1, bytes };
}

/**
 * Eine Zahl als 16-Bit-Big-Endian-Bytepaar darstellen.
 * @param n - Wert im Bereich 0..65535.
 * @returns Zwei Bytes (Hi, Lo).
 */
function uint16(n: number): number[] {
  return [(n >> 8) & 0xff, n & 0xff];
}

/**
 * Eine Zahl als 24-Bit-Big-Endian-Tripel darstellen (Tempo-µs/Quarter).
 * @param n - Wert im Bereich 0..16777215.
 * @returns Drei Bytes (Hi, Mid, Lo).
 */
function uint24(n: number): number[] {
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Eine Zahl als 32-Bit-Big-Endian-Quadrupel darstellen (MTrk-Laenge).
 * @param n - Wert im Bereich 0..4294967295.
 * @returns Vier Bytes (Hi..Lo).
 */
function uint32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}
