// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { locateClipBlock } from "#src/automation/als-envelope-writer.ts";
import { readAls } from "#src/automation/als-file.ts";
import {
  extractMidiNotes,
  getGlobalTempoBpm,
} from "#src/automation/als-midi-notes.ts";

const SET = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";

/**
 * Roher Clip-Block des benannten Clips aus dem echten e2e-Test-Set lesen.
 * @param name - Exakter Clip-Name.
 * @returns Clip-Block-String.
 */
function clip(name: string): string {
  return locateClipBlock(readAls(SET), name).block;
}

describe("extractMidiNotes (echter 'Beat'-MidiClip)", () => {
  it("liest beide KeyTracks (Pitch 36 Kick + 38 Snare), 4 Noten", () => {
    const { notes, timeSig } = extractMidiNotes(clip("Beat"));

    expect(timeSig).toStrictEqual({ num: 4, den: 4 });
    expect(notes).toHaveLength(4);

    const p36 = notes
      .filter((n) => n.pitch === 36)
      .map((n) => n.startBeats)
      .sort((a, b) => a - b);
    const p38 = notes
      .filter((n) => n.pitch === 38)
      .map((n) => n.startBeats)
      .sort((a, b) => a - b);

    expect(p36).toStrictEqual([0, 2]);
    expect(p38).toStrictEqual([1, 3]);
  });

  it("liest Velocity/OffVelocity/Duration der Kick-Note bei Beat 0", () => {
    const { notes } = extractMidiNotes(clip("Beat"));
    const kick0 = notes.find((n) => n.pitch === 36 && n.startBeats === 0);

    expect(kick0).toStrictEqual({
      pitch: 36,
      startBeats: 0,
      durationBeats: 0.25,
      velocity: 127,
      offVelocity: 64,
    });
  });

  it("greift Velocity korrekt trotz VelocityDeviation-Zwischenattribut", () => {
    const { notes } = extractMidiNotes(clip("Beat"));
    const snare1 = notes.find((n) => n.pitch === 38 && n.startBeats === 1);

    expect(snare1?.velocity).toBe(113);
    expect(snare1?.offVelocity).toBe(64);
  });
});

describe("extractMidiNotes Guards & Edge", () => {
  it("wirft bei AudioClip ('sample')", () => {
    expect(() => extractMidiNotes(clip("sample"))).toThrow(
      /MIDI-Export nur fuer MidiClip/,
    );
  });

  it("KeyTrack ohne Noten -> leere Notenliste", () => {
    const xml =
      "<MidiClip>" +
      '<TimeSignature><Numerator Value="3" /><Denominator Value="4" /></TimeSignature>' +
      '<KeyTrack><Notes></Notes><MidiKey Value="40" /></KeyTrack>' +
      "</MidiClip>";
    const { notes, timeSig } = extractMidiNotes(xml);

    expect(notes).toStrictEqual([]);
    expect(timeSig).toStrictEqual({ num: 3, den: 4 });
  });

  it("wirft bei NaN-Attribut (Velocity nicht numerisch)", () => {
    const xml =
      "<MidiClip>" +
      '<TimeSignature><Numerator Value="4" /><Denominator Value="4" /></TimeSignature>' +
      "<KeyTrack><Notes>" +
      '<MidiNoteEvent Time="0" Duration="1" Velocity="abc" OffVelocity="64" NoteId="1" />' +
      '</Notes><MidiKey Value="60" /></KeyTrack></MidiClip>';

    expect(() => extractMidiNotes(xml)).toThrow(/keine zahl|ungueltig/i);
  });

  it("wirft bei NaN-MidiKey", () => {
    const xml =
      "<MidiClip>" +
      '<TimeSignature><Numerator Value="4" /><Denominator Value="4" /></TimeSignature>' +
      "<KeyTrack><Notes>" +
      '<MidiNoteEvent Time="0" Duration="1" Velocity="80" OffVelocity="64" NoteId="1" />' +
      '</Notes><MidiKey Value="xx" /></KeyTrack></MidiClip>';

    expect(() => extractMidiNotes(xml)).toThrow(/keine zahl|ungueltig/i);
  });

  it("wirft bei KeyTrack ohne <MidiKey>", () => {
    const xml =
      "<MidiClip>" +
      '<TimeSignature><Numerator Value="4" /><Denominator Value="4" /></TimeSignature>' +
      "<KeyTrack><Notes></Notes></KeyTrack></MidiClip>";

    expect(() => extractMidiNotes(xml)).toThrow(/MidiKey/);
  });

  it("wirft bei fehlendem Pflichtattribut (Duration fehlt)", () => {
    const xml =
      "<MidiClip>" +
      '<TimeSignature><Numerator Value="4" /><Denominator Value="4" /></TimeSignature>' +
      "<KeyTrack><Notes>" +
      '<MidiNoteEvent Time="0" Velocity="80" OffVelocity="64" NoteId="1" />' +
      '</Notes><MidiKey Value="60" /></KeyTrack></MidiClip>';

    expect(() => extractMidiNotes(xml)).toThrow(/Duration.*fehlt/);
  });

  it("wirft bei fehlender Clip-<TimeSignature>", () => {
    const xml =
      "<MidiClip>" +
      '<KeyTrack><Notes></Notes><MidiKey Value="60" /></KeyTrack>' +
      "</MidiClip>";

    expect(() => extractMidiNotes(xml)).toThrow(/TimeSignature/);
  });
});

describe("extractMidiNotes MIDI-Bereichs-Haertung (0..127)", () => {
  /**
   * Einen MidiClip-Block mit genau einer Note bauen.
   * @param key - MidiKey-Wert (Pitch).
   * @param vel - Velocity-Wert.
   * @param offVel - OffVelocity-Wert.
   * @returns Der `<MidiClip>`-Block-String.
   */
  function oneNoteClip(key: string, vel: string, offVel: string): string {
    return (
      "<MidiClip>" +
      '<TimeSignature><Numerator Value="4" /><Denominator Value="4" /></TimeSignature>' +
      "<KeyTrack><Notes>" +
      `<MidiNoteEvent Time="0" Duration="1" Velocity="${vel}" OffVelocity="${offVel}" NoteId="1" />` +
      `</Notes><MidiKey Value="${key}" /></KeyTrack></MidiClip>`
    );
  }

  it("akzeptiert Grenzen 0 und 127 (pitch/velocity/offVelocity)", () => {
    expect(extractMidiNotes(oneNoteClip("0", "0", "0")).notes[0]).toStrictEqual(
      {
        pitch: 0,
        startBeats: 0,
        durationBeats: 1,
        velocity: 0,
        offVelocity: 0,
      },
    );
    expect(
      extractMidiNotes(oneNoteClip("127", "127", "127")).notes[0],
    ).toStrictEqual({
      pitch: 127,
      startBeats: 0,
      durationBeats: 1,
      velocity: 127,
      offVelocity: 127,
    });
  });

  it("wirft bei pitch ausserhalb 0..127 (200 / -1 / 128)", () => {
    expect(() => extractMidiNotes(oneNoteClip("200", "64", "64"))).toThrow(
      /MidiKey.*0\.\.127/,
    );
    expect(() => extractMidiNotes(oneNoteClip("-1", "64", "64"))).toThrow(
      /0\.\.127/,
    );
    expect(() => extractMidiNotes(oneNoteClip("128", "64", "64"))).toThrow(
      /0\.\.127/,
    );
  });

  it("wirft bei velocity ausserhalb 0..127 (200 / -1 / 128)", () => {
    expect(() => extractMidiNotes(oneNoteClip("60", "200", "64"))).toThrow(
      /Velocity.*0\.\.127/,
    );
    expect(() => extractMidiNotes(oneNoteClip("60", "-1", "64"))).toThrow(
      /0\.\.127/,
    );
    expect(() => extractMidiNotes(oneNoteClip("60", "128", "64"))).toThrow(
      /0\.\.127/,
    );
  });

  it("wirft bei offVelocity ausserhalb 0..127 (200 / -1 / 128)", () => {
    expect(() => extractMidiNotes(oneNoteClip("60", "64", "200"))).toThrow(
      /OffVelocity.*0\.\.127/,
    );
    expect(() => extractMidiNotes(oneNoteClip("60", "64", "-1"))).toThrow(
      /0\.\.127/,
    );
    expect(() => extractMidiNotes(oneNoteClip("60", "64", "128"))).toThrow(
      /0\.\.127/,
    );
  });
});

describe("getGlobalTempoBpm", () => {
  it("liest 108 aus dem echten Set", () => {
    expect(getGlobalTempoBpm(readAls(SET))).toBe(108);
  });

  it("wirft wenn <Tempo>/<Manual> fehlt", () => {
    expect(() => getGlobalTempoBpm("<LiveSet></LiveSet>")).toThrow(/Tempo/);
  });

  it("wirft bei nicht-numerischem Manual-Wert", () => {
    expect(() =>
      getGlobalTempoBpm('<Tempo><Manual Value="abc" /></Tempo>'),
    ).toThrow(/tempo|zahl/i);
  });
});
