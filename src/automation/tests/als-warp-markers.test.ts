// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { locateClipBlock } from "#src/automation/als-envelope-writer.ts";
import { readAls } from "#src/automation/als-file.ts";
import {
  getWarpMarkers,
  patchWarpMarkers,
  type WarpMarker,
} from "#src/automation/als-warp-markers.ts";

const SET = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";
const CLIP = "sample";

/**
 * Den `<AudioClip>`-Block des gewarpten Test-Clips "sample" laden.
 * @returns Roher Clip-Block-String.
 */
function sampleClip(): string {
  return locateClipBlock(readAls(SET), CLIP).block;
}

describe("getWarpMarkers", () => {
  it("parst die echten gewarpten Marker aus dem e2e-test-set", () => {
    const markers = getWarpMarkers(sampleClip());

    expect(markers).toStrictEqual([
      { secTime: "0", beatTime: "0" },
      {
        secTime: "0.416248944706087587",
        beatTime: "0.749248147685647736",
      },
      { secTime: "0.557236464263249687", beatTime: "1.125" },
      { secTime: "1.0820234750699063", beatTime: "1.9476422015484516" },
      { secTime: "1.0993845861810174", beatTime: "1.9788922015484516" },
    ]);
  });

  it("reicht lange Float-Literale woertlich durch (kein Reformat)", () => {
    const xml =
      "<AudioClip><SampleWarpProperties><WarpMarkers>\n" +
      '\t<WarpMarker Id="0" SecTime="0" BeatTime="0" />\n' +
      '\t<WarpMarker Id="1" SecTime="0.0163755450697324265" BeatTime="0.03125" />\n' +
      "</WarpMarkers></SampleWarpProperties></AudioClip>";

    expect(getWarpMarkers(xml)[1]?.secTime).toBe("0.0163755450697324265");
  });

  it("gibt leere Liste ohne WarpMarker-Tags", () => {
    expect(getWarpMarkers("<AudioClip></AudioClip>")).toStrictEqual([]);
  });
});

describe("patchWarpMarkers", () => {
  it("ersetzt die Liste, Indent/Whitespace 1:1 erhalten", () => {
    const before = sampleClip();
    const next: WarpMarker[] = [
      { secTime: "0", beatTime: "0" },
      { secTime: "0.5", beatTime: "1.0" },
      { secTime: "1.25", beatTime: "2.5" },
    ];
    const out = patchWarpMarkers(before, next);
    const block = out.match(/<WarpMarkers>[^]*?<\/WarpMarkers>/)?.[0] ?? "";

    expect(getWarpMarkers(out)).toStrictEqual(next);
    expect(block).toContain('<WarpMarker Id="0" SecTime="0" BeatTime="0" />');
    expect(block).toContain(
      '<WarpMarker Id="2" SecTime="1.25" BeatTime="2.5" />',
    );
    // Indent-Token aus dem Original wiederverwendet (12 Tabs vor Marker).
    expect(block).toContain('\n\t\t\t\t\t\t\t\t\t\t\t\t<WarpMarker Id="0"');
  });

  it("ist wert-/whitespace-erhaltend; Block ab 2. Pass byte-stabil", () => {
    const before = sampleClip();
    const origBlock =
      before.match(/<WarpMarkers>[^]*?<\/WarpMarkers>/)?.[0] ?? "";
    const out = patchWarpMarkers(before, getWarpMarkers(before));
    const newBlock = out.match(/<WarpMarkers>[^]*?<\/WarpMarkers>/)?.[0] ?? "";

    // Anker/Id wird auf 0..n-1 dicht normalisiert; Wert + Whitespace muessen
    // jedoch byte-gleich bleiben. Roundtrip auf der get-Ausgabe ist stabil.
    expect(getWarpMarkers(out)).toStrictEqual(getWarpMarkers(before));
    const out2 = patchWarpMarkers(out, getWarpMarkers(out));

    expect(out2.match(/<WarpMarkers>[^]*?<\/WarpMarkers>/)?.[0]).toBe(newBlock);
    expect(origBlock.length).toBeGreaterThan(0);
  });

  it("wirft bei Nicht-AudioClip", () => {
    expect(() =>
      patchWarpMarkers("<MidiClip><WarpMarkers></WarpMarkers></MidiClip>", [
        { secTime: "0", beatTime: "0" },
        { secTime: "1", beatTime: "1" },
      ]),
    ).toThrow(/AudioClip/);
  });

  it("wirft bei < 2 Markern", () => {
    expect(() =>
      patchWarpMarkers("<AudioClip><WarpMarkers></WarpMarkers></AudioClip>", [
        { secTime: "0", beatTime: "0" },
      ]),
    ).toThrow(/mindestens 2|2 marker/i);
  });

  it("wirft bei nicht strikt monoton steigender beatTime", () => {
    expect(() =>
      patchWarpMarkers("<AudioClip><WarpMarkers></WarpMarkers></AudioClip>", [
        { secTime: "0", beatTime: "0" },
        { secTime: "1", beatTime: "2" },
        { secTime: "2", beatTime: "2" },
      ]),
    ).toThrow(/monoton/i);
  });

  it("wirft bei NaN-beatTime mit eigener Meldung (nicht 'monoton')", () => {
    expect(() =>
      patchWarpMarkers("<AudioClip><WarpMarkers></WarpMarkers></AudioClip>", [
        { secTime: "0", beatTime: "0" },
        { secTime: "1", beatTime: "abc" },
      ]),
    ).toThrow(/keine zahl/i);
  });

  it("wirft bei fehlendem <WarpMarkers>-Block", () => {
    expect(() =>
      patchWarpMarkers("<AudioClip></AudioClip>", [
        { secTime: "0", beatTime: "0" },
        { secTime: "1", beatTime: "1" },
      ]),
    ).toThrow(/WarpMarkers/);
  });

  it("nutzt Newline-Fallback bei leerem <WarpMarkers></WarpMarkers>", () => {
    // Leerer Block: /<WarpMarkers>(\s*)<WarpMarker/ matcht nicht -> lead null
    // -> Indent-Fallback "\n" greift (Z.62 Fallback-Zweig).
    const out = patchWarpMarkers("<AudioClip><WarpMarkers></WarpMarkers>", [
      { secTime: "0", beatTime: "0" },
      { secTime: "1", beatTime: "1" },
    ]);

    expect(out).toBe(
      "<AudioClip><WarpMarkers>" +
        '\n<WarpMarker Id="0" SecTime="0" BeatTime="0" />' +
        '\n<WarpMarker Id="1" SecTime="1" BeatTime="1" />' +
        "</WarpMarkers>",
    );
    expect(getWarpMarkers(out)).toStrictEqual([
      { secTime: "0", beatTime: "0" },
      { secTime: "1", beatTime: "1" },
    ]);
  });
});
