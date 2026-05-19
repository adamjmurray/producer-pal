// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  encodeSmf,
  encodeVlq,
  type SmfInput,
  type SmfNote,
} from "#src/automation/midi-file-writer.ts";

/**
 * Bytes als Hex-Array-Strings vergleichbar machen (lesbare Mismatch-Diffs).
 * @param bytes - Roher Byte-Array.
 * @returns Liste zweistelliger Grossbuchstaben-Hex-Strings.
 */
function hex(bytes: Uint8Array | number[]): string[] {
  return [...bytes].map((b) => b.toString(16).toUpperCase().padStart(2, "0"));
}

const BASE: Omit<SmfInput, "notes"> = {
  ppq: 480,
  tempoBpm: 120,
  timeSig: { num: 4, den: 4 },
};

describe("encodeVlq", () => {
  it.each<[number, number[]]>([
    [0, [0x00]],
    [0x7f, [0x7f]],
    [0x80, [0x81, 0x00]],
    [0x3fff, [0xff, 0x7f]],
    [0x4000, [0x81, 0x80, 0x00]],
    [0x200000, [0x81, 0x80, 0x80, 0x00]],
    [0x0fffffff, [0xff, 0xff, 0xff, 0x7f]],
  ])("kodiert %d gegen SMF-Spec-Referenzvektor", (value, expected) => {
    expect(encodeVlq(value)).toStrictEqual(expected);
  });
});

describe("encodeSmf MThd-Header", () => {
  it("ist exakt 14 Bytes mit ppq=480 -> 01 E0", () => {
    const out = encodeSmf({ ...BASE, notes: [] });
    const head = hex(out.slice(0, 14));

    expect(head).toStrictEqual([
      "4D",
      "54",
      "68",
      "64",
      "00",
      "00",
      "00",
      "06",
      "00",
      "00",
      "00",
      "01",
      "01",
      "E0",
    ]);
  });
});

describe("encodeSmf Meta-Events", () => {
  it("Tempo 120 BPM -> 500000 µs -> 07 A1 20", () => {
    const out = hex(encodeSmf({ ...BASE, notes: [] }));
    const i = out.indexOf("FF");

    expect(out.slice(i, i + 6)).toStrictEqual([
      "FF",
      "51",
      "03",
      "07",
      "A1",
      "20",
    ]);
  });

  it("TimeSig 4/4 -> FF 58 04 04 02 18 08", () => {
    const out = hex(encodeSmf({ ...BASE, notes: [] }));
    const i = out.indexOf("58");

    expect(out.slice(i - 1, i + 6)).toStrictEqual([
      "FF",
      "58",
      "04",
      "04",
      "02",
      "18",
      "08",
    ]);
  });
});

describe("encodeSmf eine Note", () => {
  it("erzeugt exakte MTrk-Bytes (pitch60,start0,dur480,vel100,off64)", () => {
    const note: SmfNote = {
      pitch: 60,
      startTick: 0,
      durationTick: 480,
      velocity: 100,
      offVelocity: 64,
    };
    const out = encodeSmf({ ...BASE, notes: [note] });
    const expectedTrk = [
      "4D",
      "54",
      "72",
      "6B",
      "00",
      "00",
      "00",
      "1C",
      "00",
      "FF",
      "51",
      "03",
      "07",
      "A1",
      "20",
      "00",
      "FF",
      "58",
      "04",
      "04",
      "02",
      "18",
      "08",
      "00",
      "90",
      "3C",
      "64",
      "83",
      "60",
      "80",
      "3C",
      "40",
      "00",
      "FF",
      "2F",
      "00",
    ];

    expect(hex(out.slice(14))).toStrictEqual(expectedTrk);
  });
});

describe("encodeSmf leere Notenliste", () => {
  it("erzeugt valides re-parsebares minimal-SMF (Meta + EOT)", () => {
    const out = encodeSmf({ ...BASE, notes: [] });

    // MThd
    expect(hex(out.slice(0, 4))).toStrictEqual(["4D", "54", "68", "64"]);
    // MTrk magic
    expect(hex(out.slice(14, 18))).toStrictEqual(["4D", "54", "72", "6B"]);

    const trkLen = new DataView(
      out.buffer,
      out.byteOffset,
      out.byteLength,
    ).getUint32(18);

    // Body == declared length + magic(4) + len(4) header.
    expect(out).toHaveLength(22 + trkLen);
    // EOT-Schlusssequenz.
    expect(hex(out.slice(-3))).toStrictEqual(["FF", "2F", "00"]);
  });
});

describe("encodeSmf Determinismus & Ordnung (R1/R2/R4)", () => {
  it("zweimaliges Encoden ist byte-identisch", () => {
    const input: SmfInput = {
      ...BASE,
      notes: [
        {
          pitch: 64,
          startTick: 240,
          durationTick: 120,
          velocity: 90,
          offVelocity: 64,
        },
        {
          pitch: 60,
          startTick: 0,
          durationTick: 480,
          velocity: 100,
          offVelocity: 64,
        },
      ],
    };

    expect(encodeSmf(input)).toStrictEqual(encodeSmf(input));
  });

  it("unsortierte/ueberlappende Noten ergeben stabile totale Ordnung", () => {
    const a: SmfInput = {
      ...BASE,
      notes: [
        {
          pitch: 67,
          startTick: 0,
          durationTick: 480,
          velocity: 80,
          offVelocity: 64,
        },
        {
          pitch: 60,
          startTick: 0,
          durationTick: 480,
          velocity: 80,
          offVelocity: 64,
        },
      ],
    };
    const b: SmfInput = {
      ...BASE,
      notes: [a.notes[1]!, a.notes[0]!],
    };

    expect(encodeSmf(a)).toStrictEqual(encodeSmf(b));
  });

  it("Off vor On bei Tick-Gleichstand (pitch60 endet wo pitch62 startet)", () => {
    const input: SmfInput = {
      ...BASE,
      notes: [
        {
          pitch: 62,
          startTick: 480,
          durationTick: 480,
          velocity: 70,
          offVelocity: 64,
        },
        {
          pitch: 60,
          startTick: 0,
          durationTick: 480,
          velocity: 70,
          offVelocity: 64,
        },
      ],
    };
    const h = hex(encodeSmf(input));
    const off = h.indexOf("80");
    const on = h.indexOf("90", off);

    // 0x80 (Note-Off) erscheint vor dem zweiten 0x90 bei Tick 480.
    expect(off).toBeGreaterThan(-1);
    expect(on).toBeGreaterThan(off);
  });

  it("Tick-Rundung: .5-Beat-Start deterministisch (Math.round)", () => {
    const note: SmfNote = {
      pitch: 60,
      startTick: Math.round(0.5 * 480),
      durationTick: Math.round(0.25 * 480),
      velocity: 100,
      offVelocity: 64,
    };

    expect(encodeSmf({ ...BASE, notes: [note] })).toStrictEqual(
      encodeSmf({ ...BASE, notes: [note] }),
    );
  });
});
