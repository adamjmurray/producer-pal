// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  TRACK_GROUP_SPEC,
  patchTrackField,
  assertGroupExists,
} from "#src/automation/als-track-group.ts";

const SET = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";
const readXml = (): string => gunzipSync(readFileSync(SET)).toString("utf8");

// MEMBER-NAME recon-verifiziert: realer <EffectiveName Value="…"/> des
// Members mit TrackGroupId=39). NICHT raten.
const MEMBER_NAME = "Child"; // recon-verifiziert (GroupTrack="Parent" Id=39)

/**
 * Den Member-Track-Block NAME-verankert extrahieren (Premortem-R1:
 * KEINE Typ-lastIndexOf-Heuristik — die greift bei AudioTrack-Membern
 * mit vorausgehenden MidiTracks den falschen Block). Sucht das
 * `<Name Value="${MEMBER_NAME}" />`, geht zum umschließenden
 * `<MidiTrack `/`<AudioTrack `-Open-Tag zurück, schließt mit dem
 * passenden `</…Track>`.
 * @param xml - Dekomprimierter .als-XML-String.
 * @returns Der Member-Track-Substring.
 */
function memberBlock(xml: string): string {
  // Track-Namen liegen als <EffectiveName Value="…" /> (NICHT self-closing
  // <Name Value=/>) — recon-verifiziert e2e-test-set: Member="Child"
  // (MidiTrack, EffectiveName 1× eindeutig), GroupTrack="Parent" Id=39.
  const nameIdx = xml.indexOf('<EffectiveName Value="' + MEMBER_NAME + '" />');
  const mi = xml.lastIndexOf("<MidiTrack ", nameIdx);
  const ai = xml.lastIndexOf("<AudioTrack ", nameIdx);
  const open = Math.max(mi, ai); // nächstliegender Open-Tag vor dem Namen
  const closeTag = mi > ai ? "</MidiTrack>" : "</AudioTrack>";
  const close = xml.indexOf(closeTag, nameIdx) + closeTag.length;

  return xml.slice(open, close);
}

describe("Slice-8 als-track-group", () => {
  it("TRACK_GROUP_SPEC exakt", () => {
    expect(TRACK_GROUP_SPEC).toStrictEqual({
      TrackGroupId: { tag: "TrackGroupId", type: "int" },
      TrackUnfolded: { tag: "TrackUnfolded", type: "bool" },
    });
  });

  it("patchTrackField TrackGroupId 39→-1 byte-treu (1×)", () => {
    const b = memberBlock(readXml());
    const out = patchTrackField(b, "TrackGroupId", "-1");

    expect(out).toContain('<TrackGroupId Value="-1" />');
    expect([...out.matchAll(/<TrackGroupId Value=/g)]).toHaveLength(
      [...b.matchAll(/<TrackGroupId Value=/g)].length,
    );
  });

  it("patchTrackField nur Ziel-Tag (Rest byte-identisch)", () => {
    const b = memberBlock(readXml());
    const out = patchTrackField(b, "TrackGroupId", "-1");
    const i = b.indexOf("<TrackGroupId Value=");
    const j = b.indexOf("/>", i) + 2;

    expect(out.slice(0, i)).toBe(b.slice(0, i));
    expect(out.slice(out.indexOf("/>", i) + 2)).toBe(b.slice(j));
  });

  it("patchTrackField TrackUnfolded true→false", () => {
    const b = memberBlock(readXml());

    expect(patchTrackField(b, "TrackUnfolded", "false")).toContain(
      '<TrackUnfolded Value="false"',
    );
  });

  it("patchTrackField wirft bei fehlendem Tag", () => {
    expect(() => patchTrackField("<x/>", "TrackGroupId", "-1")).toThrow(
      /TrackGroupId/,
    );
  });

  it("patchTrackField wirft bei unbekanntem Feld", () => {
    expect(() => patchTrackField(memberBlock(readXml()), "Bogus", "1")).toThrow(
      /bogus|unbekannt/i,
    );
  });

  it("patchTrackField wirft bei ungültigem int", () => {
    expect(() =>
      patchTrackField(memberBlock(readXml()), "TrackGroupId", "x"),
    ).toThrow(/int|ganzzahlig|integer/i);
  });

  it("patchTrackField wirft bei ungültigem bool", () => {
    expect(() =>
      patchTrackField(memberBlock(readXml()), "TrackUnfolded", "ja"),
    ).toThrow(/true|false|bool/i);
  });

  it("assertGroupExists: -1 ok, 39 ok, 999 wirft", () => {
    const xml = readXml();

    expect(() => assertGroupExists(xml, "-1")).not.toThrow();
    expect(() => assertGroupExists(xml, "39")).not.toThrow();
    expect(() => assertGroupExists(xml, "999")).toThrow(/999|slice 8b|engine/i);
  });
});
