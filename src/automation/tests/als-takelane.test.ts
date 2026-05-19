// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  getTakeLanes,
  patchTakeLanes,
  type TakeLaneSpec,
} from "../als-takelane.ts";

// Leerer Default exakt wie aus dem sauberen Fixture extrahiert
// (5 Tabs Basis-Indent vor <TakeLanes />, 4 Tabs vor </TakeLanes>).
const EMPTY =
  "<TakeLanes>\n" +
  "\t\t\t\t\t<TakeLanes />\n" +
  '\t\t\t\t\t<AreTakeLanesFolded Value="true" />\n' +
  "\t\t\t\t</TakeLanes>";

// Synthetischer, minimaler AudioClip-Body (verbatim durchgereicht).
const CLIP_A =
  '<AudioClip Id="0" Time="10">\n' +
  '\t\t\t\t\t\t\t\t\t\t<TakeId Value="1" />\n' +
  '\t\t\t\t\t\t\t\t\t<Name Value="Take A" />\n' +
  "\t\t\t\t\t\t\t\t\t</AudioClip>";
const CLIP_B =
  '<AudioClip Id="0" Time="10">\n' +
  '\t\t\t\t\t\t\t\t\t\t<TakeId Value="2" />\n' +
  "\t\t\t\t\t\t\t\t\t</AudioClip>";

const SPECS: TakeLaneSpec[] = [
  {
    id: "1",
    takeId: "1",
    height: "51",
    isContentSelected: "false",
    clipXml: CLIP_A,
  },
  {
    id: "0",
    takeId: "2",
    height: "51",
    isContentSelected: "true",
    clipXml: CLIP_B,
  },
];

describe("getTakeLanes", () => {
  it("leerer Default -> { folded: true, lanes: [] }", () => {
    expect(getTakeLanes(EMPTY)).toStrictEqual({ folded: true, lanes: [] });
  });

  it("populiert -> wert-gebundene Lane-Liste (clipXml verbatim)", () => {
    const populated = patchTakeLanes(EMPTY, SPECS);
    const parsed = getTakeLanes(populated);

    expect(parsed.folded).toBe(false);
    expect(parsed.lanes).toStrictEqual(SPECS);
  });

  it("Wrapper ohne <AreTakeLanesFolded> -> Throw", () => {
    expect(() => getTakeLanes("<TakeLanes><TakeLanes /></TakeLanes>")).toThrow(
      /AreTakeLanesFolded/,
    );
  });

  it("Lane-AudioClip ohne <TakeId> -> Throw", () => {
    // Lane matcht das Lane-Regex (Height+IsContentSelected+AudioClip),
    // aber der AudioClip-Body hat kein <TakeId> -> wert-gebundener Throw.
    const noTakeId =
      "<TakeLanes>\n" +
      "\t<TakeLanes>\n" +
      '\t\t<TakeLane Id="0">\n' +
      '\t\t\t<Height Value="51" />\n' +
      '\t\t\t<IsContentSelectedInDocument Value="true" />\n' +
      '\t\t\t<AudioClip Id="0" Time="0"><Name Value="x" /></AudioClip>\n' +
      "\t\t</TakeLane>\n" +
      "\t</TakeLanes>\n" +
      '\t<AreTakeLanesFolded Value="false" />\n' +
      "</TakeLanes>";

    expect(() => getTakeLanes(noTakeId)).toThrow(/TakeId/);
  });

  it("Silent-Skip-Guard: <TakeLane> mit AudioClip Id!=0 -> Throw (F1)", () => {
    // Eine Lane bekommt AudioClip Id="1"; laneRe (Id="0") ueberspringt sie,
    // der Tag-Count-Guard erzwingt den Fehler statt stiller Kuerzung.
    const populated = patchTakeLanes(EMPTY, SPECS).replace(
      '<AudioClip Id="0" Time="10">\n\t\t\t\t\t\t\t\t\t\t<TakeId Value="2"',
      '<AudioClip Id="1" Time="10">\n\t\t\t\t\t\t\t\t\t\t<TakeId Value="2"',
    );

    expect(() => getTakeLanes(populated)).toThrow(/TakeLane-Anzahl/);
  });
});

describe("patchTakeLanes", () => {
  it("empty -> populiert: byte-stabiler Roundtrip + folded=false", () => {
    const out = patchTakeLanes(EMPTY, SPECS);

    expect(out.startsWith("<TakeLanes>\n")).toBe(true);
    expect(out).toContain('<AreTakeLanesFolded Value="false" />');
    expect(out).toContain('<TakeLane Id="1">');
    expect(out).toContain('<TakeLane Id="0">');
    expect(out).toContain('<Height Value="51" />');
    expect(out).toContain('<IsContentSelectedInDocument Value="false" />');
    expect(out).toContain('<IsContentSelectedInDocument Value="true" />');
    expect(out).toContain('<Name Value="Lane" />');
    expect(out).toContain(CLIP_A);
    expect(out).toContain(CLIP_B);
    // idempotenter Get nach Patch
    expect(getTakeLanes(out)).toStrictEqual({ folded: false, lanes: SPECS });
  });

  it("Indent-erhaltend: Basis-Indent aus dem leeren Default abgeleitet", () => {
    // Anderer Basis-Indent (3 Tabs) -> Lane-/Folded-Indent skaliert mit.
    const empty3 =
      "<TakeLanes>\n" +
      "\t\t\t<TakeLanes />\n" +
      '\t\t\t<AreTakeLanesFolded Value="true" />\n' +
      "\t\t</TakeLanes>";
    const out = patchTakeLanes(empty3, SPECS);

    expect(out).toContain('\n\t\t\t\t<TakeLane Id="1">');
    expect(out).toContain('\n\t\t\t<AreTakeLanesFolded Value="false" />');
    expect(getTakeLanes(out)).toStrictEqual({ folded: false, lanes: SPECS });
  });

  it("leeres lanes-Array -> Throw (kein Teil-Patch)", () => {
    expect(() => patchTakeLanes(EMPTY, [])).toThrow(/mindestens eine Lane/);
  });

  it("Wrapper bereits populiert (nicht leerer Default) -> Throw", () => {
    const populated = patchTakeLanes(EMPTY, SPECS);

    expect(() => patchTakeLanes(populated, SPECS)).toThrow(
      /leerer Default-Wrapper/,
    );
  });

  it("fehlender <TakeLanes>-Wrapper -> Throw", () => {
    expect(() => patchTakeLanes("<Foo />", SPECS)).toThrow(/Wrapper/);
  });

  it("fehlendes <AreTakeLanesFolded> -> Throw", () => {
    expect(() =>
      patchTakeLanes("<TakeLanes>\n\t<TakeLanes />\n</TakeLanes>", SPECS),
    ).toThrow(/leerer Default-Wrapper/);
  });

  it("Lane-Spec mit fehlendem Pflichtfeld -> Throw", () => {
    const bad = [{ ...SPECS[0], id: "" }] as TakeLaneSpec[];

    expect(() => patchTakeLanes(EMPTY, bad)).toThrow(/Pflichtfeld/);
  });

  it("clipXml ohne <AudioClip -> Throw", () => {
    const bad = [{ ...SPECS[0], clipXml: "<MidiClip />" }] as TakeLaneSpec[];

    expect(() => patchTakeLanes(EMPTY, bad)).toThrow(/AudioClip/);
  });

  it("Codex F1: takeId != embedded <TakeId> -> Throw VOR Write (kein Teil-Patch)", () => {
    // SPECS[0].takeId = "1", aber clipXml enthaelt <TakeId Value="9" />
    const corruptClip = CLIP_A.replace(
      '<TakeId Value="1" />',
      '<TakeId Value="9" />',
    );
    const bad = [
      { ...SPECS[0], clipXml: corruptClip },
      SPECS[1],
    ] as TakeLaneSpec[];

    expect(() => patchTakeLanes(EMPTY, bad)).toThrow(/takeId "1" != embedded/);
  });

  it("Codex F1: clipXml ohne <TakeId> -> Throw", () => {
    const noTakeId =
      '<AudioClip Id="0" Time="0"><Name Value="X" /></AudioClip>';
    const bad = [{ ...SPECS[0], clipXml: noTakeId }] as TakeLaneSpec[];

    expect(() => patchTakeLanes(EMPTY, bad)).toThrow(/ohne <TakeId>/);
  });
});
