// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { locateClipBlock } from "#src/automation/als-envelope-writer.ts";
import { readAls } from "#src/automation/als-file.ts";
import {
  getClipScale,
  patchClipScale,
} from "#src/automation/als-clip-scale.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";
import { VALID_SCALE_NAMES } from "#src/tools/constants.ts";

const SET = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";

/**
 * Den Clip-Block eines benannten Clips strikt innerhalb eines Tracks laden
 * (spiegelt das `locateClipWithinTrack`-Vorgehen ohne Scripts-Import).
 * @param track - Track-Anzeigename.
 * @param clip - Clip-Name.
 * @returns Roher Clip-Block-String.
 */
function clipBlock(track: string, clip: string): string {
  const t = locateTrackBlock(readAls(SET), track);

  return locateClipBlock(t.block, clip).block;
}

const MIDI = clipBlock("Drums", "Beat");
const AUDIO = clipBlock("Audio 1", "sample");

describe("getClipScale", () => {
  it("liest Root/Name des echten MidiClips (Root 9, Index 1 = Minor)", () => {
    expect(getClipScale(MIDI)).toStrictEqual({
      root: 9,
      scaleIndex: 1,
      scaleName: "Minor",
    });
  });

  it("liefert scaleName=null bei Out-of-Range-Index (kein Throw)", () => {
    const xml =
      "<MidiClip><ScaleInformation>" +
      '<Root Value="3" /><Name Value="999" />' +
      "</ScaleInformation></MidiClip>";

    expect(getClipScale(xml)).toStrictEqual({
      root: 3,
      scaleIndex: 999,
      scaleName: null,
    });
  });

  it("wirft bei komplett fehlendem ScaleInformation-Block", () => {
    expect(() => getClipScale("<MidiClip></MidiClip>")).toThrow(
      /ScaleInformation/,
    );
  });

  it("wirft bei vorhandenem Root aber fehlendem Name-Tag", () => {
    const xml =
      '<MidiClip><ScaleInformation><Root Value="9" />' +
      "</ScaleInformation></MidiClip>";

    expect(() => getClipScale(xml)).toThrow(/ScaleInformation/);
  });
});

describe("patchClipScale", () => {
  it("setzt Root 0 und Scale 'Major' (-> Index 0), Re-Parse == Soll", () => {
    const out = patchClipScale(MIDI, 0, "Major");

    expect(getClipScale(out)).toStrictEqual({
      root: 0,
      scaleIndex: 0,
      scaleName: "Major",
    });
  });

  it("setzt Root 11 und Scale case-insensitiv 'minor' (-> Index 1)", () => {
    const out = patchClipScale(MIDI, 11, "minor");

    expect(getClipScale(out)).toStrictEqual({
      root: 11,
      scaleIndex: 1,
      scaleName: "Minor",
    });
  });

  it("setzt 'Messiaen 7' auf den kanonischen VALID_SCALE_NAMES-Index", () => {
    const idx = VALID_SCALE_NAMES.indexOf("Messiaen 7");
    const out = patchClipScale(MIDI, 5, "Messiaen 7");

    expect(getClipScale(out)).toStrictEqual({
      root: 5,
      scaleIndex: idx,
      scaleName: "Messiaen 7",
    });
  });

  it("ändert ausschließlich die ScaleInformation-Bytes (Rest 1:1)", () => {
    const out = patchClipScale(MIDI, 4, "Dorian");
    const re = /<ScaleInformation>[\S\s]*?<\/ScaleInformation>/;
    const before = MIDI.replace(re, "");
    const after = out.replace(re, "");

    expect(after).toBe(before);
  });

  it.each([-1, 12, 1.5, Number.NaN])("wirft bei ungültigem Root %s", (root) => {
    expect(() => patchClipScale(MIDI, root, "Major")).toThrow();
  });

  it("wirft bei Root als Nicht-Zahl", () => {
    expect(() =>
      patchClipScale(MIDI, "x" as unknown as number, "Major"),
    ).toThrow();
  });

  it("wirft bei unbekanntem Scale-Namen", () => {
    expect(() => patchClipScale(MIDI, 0, "NichtEineSkala")).toThrow();
  });

  it("wirft bei AudioClip-Block (Scale nur für MidiClip)", () => {
    expect(() => patchClipScale(AUDIO, 0, "Major")).toThrow(/MidiClip/);
  });

  it("wirft bei fehlendem ScaleInformation-Block", () => {
    expect(() => patchClipScale("<MidiClip></MidiClip>", 0, "Major")).toThrow();
  });

  it("wirft bei fehlendem Root-Tag (kein Teil-Patch)", () => {
    const xml =
      '<MidiClip><ScaleInformation><Name Value="1" />' +
      "</ScaleInformation></MidiClip>";

    expect(() => patchClipScale(xml, 0, "Major")).toThrow();
  });

  it("wirft bei fehlendem Name-Tag (kein Teil-Patch)", () => {
    const xml =
      '<MidiClip><ScaleInformation><Root Value="9" />' +
      "</ScaleInformation></MidiClip>";

    expect(() => patchClipScale(xml, 0, "Major")).toThrow();
  });
});
