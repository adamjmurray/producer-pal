// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { FADE_SPEC, getFades, patchFade } from "../als-fades.ts";

const AUDIO =
  '<AudioClip Id="1" Time="0"><Name Value="AC" />' +
  "<SampleRef><X /></SampleRef><Onsets><Y /></Onsets>" +
  '<WarpMode Value="0" />' +
  '<Fade Value="true" />' +
  "<Fades>" +
  '<FadeInLength Value="0" /><FadeOutLength Value="0" />' +
  '<ClipFadesAreInitialized Value="true" /><CrossfadeInState Value="0" />' +
  '<FadeInCurveSkew Value="0" /><FadeInCurveSlope Value="0" />' +
  '<FadeOutCurveSkew Value="0" /><FadeOutCurveSlope Value="0" />' +
  '<IsDefaultFadeIn Value="true" /><IsDefaultFadeOut Value="true" />' +
  '</Fades><PitchCoarse Value="0" /></AudioClip>';

describe("FADE_SPEC", () => {
  it("hat genau 7 setbare Keys mit tag/type/def/scope", () => {
    expect(Object.keys(FADE_SPEC).sort()).toStrictEqual(
      [
        "ClipFadesAreInitialized",
        "CrossfadeInState",
        "Fade",
        "FadeInLength",
        "FadeOutLength",
        "IsDefaultFadeIn",
        "IsDefaultFadeOut",
      ].sort(),
    );
    // Skew/Slope sind LESBAR (getFades) aber NICHT in FADE_SPEC-set-Keys
  });
});

describe("getFades", () => {
  it("liest Fade + 10 Fades-Kinder inkl. Skew/Slope (alle 11)", () => {
    const f = getFades(AUDIO);

    expect(f.Fade).toBe("true");
    expect(f.FadeInLength).toBe("0");
    expect(f.FadeOutLength).toBe("0");
    expect(f.ClipFadesAreInitialized).toBe("true");
    expect(f.CrossfadeInState).toBe("0");
    expect(f.FadeInCurveSkew).toBe("0");
    expect(f.FadeInCurveSlope).toBe("0");
    expect(f.FadeOutCurveSkew).toBe("0");
    expect(f.FadeOutCurveSlope).toBe("0");
    expect(f.IsDefaultFadeIn).toBe("true");
    expect(f.IsDefaultFadeOut).toBe("true");
  });
});

describe("patchFade", () => {
  it("patcht FadeOutLength im <Fades>-Scope, Rest byte-identisch", () => {
    const out = patchFade(AUDIO, "FadeOutLength", "1.5");

    expect(out).toContain('<FadeOutLength Value="1.5" />');
    expect(out.replace('Value="1.5"', 'Value="0"')).toBe(AUDIO);
  });
  it("patcht bool <Fade> (Sibling) ohne <Fades> zu berühren", () => {
    const out = patchFade(AUDIO, "Fade", "false");

    expect(out).toContain('<Fade Value="false" />');
    expect(out).toContain("<Fades>");
    expect(out.replace('<Fade Value="false" />', '<Fade Value="true" />')).toBe(
      AUDIO,
    );
  });
  it("OFF-TARGET: <Fade>-Patch verändert <Fades>-Kinder NICHT (R1)", () => {
    const out = patchFade(AUDIO, "Fade", "false");

    expect(out).toContain('<FadeInLength Value="0" />');
    expect(out).toContain("<Fades><FadeInLength");
  });
  it("R1 BEIDRICHTUNG: <Fade>-Patch lässt ALLE <Fades>-Kinder byte-identisch", () => {
    const out = patchFade(AUDIO, "Fade", "false");
    const fadesBefore = AUDIO.match(/<Fades>[^]*?<\/Fades>/)![0];
    const fadesAfter = out.match(/<Fades>[^]*?<\/Fades>/)![0];

    expect(fadesAfter).toBe(fadesBefore);
  });
  it("R1 BEIDRICHTUNG: <Fades>-Kind-Patch lässt <Fade>-bool byte-identisch", () => {
    const out = patchFade(AUDIO, "FadeInLength", "2.0");

    expect(out.match(/<Fade Value="[^"]*" \/>/)![0]).toBe(
      '<Fade Value="true" />',
    );
  });
  it("patcht int CrossfadeInState im <Fades>-Scope", () => {
    const out = patchFade(AUDIO, "CrossfadeInState", "1");

    expect(out).toContain('<CrossfadeInState Value="1" />');
  });
  it("patcht bool ClipFadesAreInitialized im <Fades>-Scope", () => {
    const out = patchFade(AUDIO, "ClipFadesAreInitialized", "false");

    expect(out).toContain('<ClipFadesAreInitialized Value="false" />');
  });
  it("Skew/Slope-set ist gesperrt (Slice 4b) — alle 4", () => {
    expect(() => patchFade(AUDIO, "FadeInCurveSkew", "0.5")).toThrow(
      /4b|gekrümmt|nicht unterstützt/i,
    );
    expect(() => patchFade(AUDIO, "FadeInCurveSlope", "0.5")).toThrow(
      /4b|gekrümmt|nicht unterstützt/i,
    );
    expect(() => patchFade(AUDIO, "FadeOutCurveSkew", "0.5")).toThrow(
      /4b|gekrümmt|nicht unterstützt/i,
    );
    expect(() => patchFade(AUDIO, "FadeOutCurveSlope", "0.5")).toThrow(
      /4b|gekrümmt|nicht unterstützt/i,
    );
  });
  it("bool-Key nur true/false", () => {
    expect(() => patchFade(AUDIO, "IsDefaultFadeIn", "ja")).toThrow(
      /true|false/,
    );
  });
  it("Länge negativ wirft", () => {
    expect(() => patchFade(AUDIO, "FadeInLength", "-1")).toThrow(
      /negativ|>= 0|finite/i,
    );
  });
  it("Länge NaN wirft", () => {
    expect(() => patchFade(AUDIO, "FadeOutLength", "x")).toThrow(
      /finite|zahl/i,
    );
  });
  it("int-Key ungültig wirft", () => {
    expect(() => patchFade(AUDIO, "CrossfadeInState", "1.5")).toThrow(
      /integer|ganzzahl/i,
    );
  });
  it("unbekannter Key wirft mit Key-Liste", () => {
    expect(() => patchFade(AUDIO, "Nope", "1")).toThrow(
      /FadeInLength|FadeOutLength/,
    );
  });
  it("fehlender <Fades>-Block (MidiClip-artig) wirft", () => {
    expect(() =>
      patchFade('<MidiClip><Name Value="M" /></MidiClip>', "FadeInLength", "1"),
    ).toThrow(/fades|audioclip/i);
  });
  it('float-Key Leerstring wirft (kein Value="" schreiben)', () => {
    expect(() => patchFade(AUDIO, "FadeInLength", "")).toThrow(
      /finite|zahl|leer/i,
    );
  });
  it('float-Key Whitespace-only wirft (kein Value="  " schreiben)', () => {
    expect(() => patchFade(AUDIO, "FadeOutLength", "  ")).toThrow(
      /finite|zahl|leer/i,
    );
  });
  it("<Fade>-Patch ohne <WarpMode> wirft (Window-Startmarke fehlt)", () => {
    const clipOhneWarpMode =
      '<AudioClip Id="2"><Name Value="NW" />' +
      '<Fade Value="true" />' +
      "<Fades>" +
      '<FadeInLength Value="0" /><FadeOutLength Value="0" />' +
      '<ClipFadesAreInitialized Value="true" /><CrossfadeInState Value="0" />' +
      '<FadeInCurveSkew Value="0" /><FadeInCurveSlope Value="0" />' +
      '<FadeOutCurveSkew Value="0" /><FadeOutCurveSlope Value="0" />' +
      '<IsDefaultFadeIn Value="true" /><IsDefaultFadeOut Value="true" />' +
      "</Fades></AudioClip>";

    expect(() => patchFade(clipOhneWarpMode, "Fade", "false")).toThrow(
      /warpmode|positions-anker/i,
    );
  });
  it("<Fade>-Patch ohne <Fades> nach <WarpMode> wirft (Window-Endmarke fehlt)", () => {
    const clipOhneFadesAberMitWarpMode =
      '<AudioClip Id="3"><Name Value="NF" />' +
      '<WarpMode Value="0" />' +
      '<Fade Value="true" />' +
      '<PitchCoarse Value="0" /></AudioClip>';

    expect(() =>
      patchFade(clipOhneFadesAberMitWarpMode, "Fade", "false"),
    ).toThrow(/fades|positions-anker/i);
  });
});
