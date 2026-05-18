// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { FADE_SPEC, getFades, patchFade } from "../als-fades.ts";

// Byte-belegte G4b-Ground-Truth (Fixture-CDATA, Commit e266c15). FadeInCurve
// schreibt diese Tupel WÖRTLICH (keine Float-Neuformatierung):
//   up   -> FadeInCurveSkew="-1" + FadeInCurveSlope="0.8999999762"
//   down -> FadeInCurveSkew="1"  + FadeInCurveSlope="-0.8999999762"
// PLUS IsDefaultFadeIn="false". Tag-Position/Reihenfolge aus Fixture <After>.
const SKEW_UP = "-1";
const SLOPE_UP = "0.8999999762";
const SKEW_DOWN = "1";
const SLOPE_DOWN = "-0.8999999762";

const FIXTURE_PATH =
  "/Users/macuser/Desktop/AIbleton/producer-pal/" +
  "../docs/superpowers/fixtures/ableton12-fades-curve-groundtruth.xml";

/**
 * Liest den `<After>`-CDATA-`<Fades>`-Block eines Clips aus der G4b-Fixture.
 * @param clipIndex - clipIndex-Attribut im Fixture (0|1|2)
 * @returns Der wörtliche `<Fades>…</Fades>`-String aus dem `<After>`-CDATA
 */
function fixtureAfter(clipIndex: number): string {
  const xml = readFileSync(FIXTURE_PATH, "utf8");
  const block = xml
    .split(`<Fades clipIndex="${clipIndex}">`)[1]
    ?.split("</Fades>\n  </Fades>")[0];
  const after = block?.split("<After><![CDATA[")[1]?.split("]]></After>")[0];

  return after?.trim() ?? "";
}

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
  it("hat genau 8 setbare Keys mit tag/type/def/scope", () => {
    expect(Object.keys(FADE_SPEC).sort()).toStrictEqual(
      [
        "ClipFadesAreInitialized",
        "CrossfadeInState",
        "Fade",
        "FadeInCurve",
        "FadeInLength",
        "FadeOutLength",
        "IsDefaultFadeIn",
        "IsDefaultFadeOut",
      ].sort(),
    );
    // FadeInCurve = Composite-Key (up|down -> Skew+Slope+IsDefaultFadeIn).
    // FadeOut-Skew/Slope + direkte FadeIn-Skew/Slope sind set-gesperrt (4c).
  });

  it("FadeInCurve-Witness-Tag ist FadeInCurveSkew (Composite)", () => {
    expect(FADE_SPEC.FadeInCurve?.tag).toBe("FadeInCurveSkew");
    expect(FADE_SPEC.FadeInCurve?.scope).toBe("fades");
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

describe("getFades Skew/Slope Default-Charakterisierung", () => {
  it("Default-AudioClip-Block: alle 4 Skew/Slope-Tags == '0' (eingefroren)", () => {
    // Charakterisierung des Ist-Lesepfads: ein frischer Default-AudioClip
    // (Skew/Slope explizit '0' wie Live sie schreibt) liefert über getFades
    // exakt "0" für alle 4 Kurven-Tags. Friert das Ableton-Default-Verhalten
    // ein, unabhängig vom AUDIO-Konstrukt oben.
    const defaultClip =
      '<AudioClip Id="20"><Name Value="DEF" />' +
      '<WarpMode Value="0" />' +
      '<Fade Value="true" />' +
      "<Fades>" +
      '<FadeInLength Value="0" /><FadeOutLength Value="0" />' +
      '<ClipFadesAreInitialized Value="true" /><CrossfadeInState Value="0" />' +
      '<FadeInCurveSkew Value="0" /><FadeInCurveSlope Value="0" />' +
      '<FadeOutCurveSkew Value="0" /><FadeOutCurveSlope Value="0" />' +
      '<IsDefaultFadeIn Value="true" /><IsDefaultFadeOut Value="true" />' +
      "</Fades></AudioClip>";
    const f = getFades(defaultClip);

    expect(f.FadeInCurveSkew).toBe("0");
    expect(f.FadeInCurveSlope).toBe("0");
    expect(f.FadeOutCurveSkew).toBe("0");
    expect(f.FadeOutCurveSlope).toBe("0");
  });
});

describe("getFades Default-Fallbacks", () => {
  it("kein <Fades>-Block -> fades-scope Tags fallen auf Spec-Default / '0' (line 97/100)", () => {
    // Kein <Fades> -> fadesBlockOrNull == null -> fb?.block ?? "" greift (hay="")
    // -> kein Match -> FADE_SPEC[tag]?.def fuer Spec-Keys, "0" fuer Skew/Slope
    const clipOhneFades =
      '<MidiClip Id="9"><Name Value="MC" />' +
      '<Fade Value="false" /></MidiClip>';
    const f = getFades(clipOhneFades);

    expect(f.Fade).toBe("false"); // sibling-scope, im clipXml gefunden
    expect(f.FadeInLength).toBe("0"); // FADE_SPEC.FadeInLength.def
    expect(f.FadeOutLength).toBe("0");
    expect(f.ClipFadesAreInitialized).toBe("true"); // Spec-Default
    expect(f.CrossfadeInState).toBe("0");
    expect(f.IsDefaultFadeIn).toBe("true");
    expect(f.IsDefaultFadeOut).toBe("true");
    // Skew/Slope sind NICHT in FADE_SPEC -> letzter Fallback "0"
    expect(f.FadeInCurveSkew).toBe("0");
    expect(f.FadeInCurveSlope).toBe("0");
    expect(f.FadeOutCurveSkew).toBe("0");
    expect(f.FadeOutCurveSlope).toBe("0");
  });
  it("<Fades>-Block vorhanden aber Skew/Slope-Tag fehlt -> '0'-Fallback (line 100 letzter ??)", () => {
    // <Fades> da, FadeInCurveSkew fehlt -> kein Match, FADE_SPEC hat keinen
    // Skew-Eintrag -> finaler "0"-Fallback
    const clipOhneSkew =
      '<AudioClip Id="10"><Name Value="NS" />' +
      '<WarpMode Value="0" />' +
      '<Fade Value="true" />' +
      "<Fades>" +
      '<FadeInLength Value="3" /><FadeOutLength Value="0" />' +
      '<ClipFadesAreInitialized Value="true" /><CrossfadeInState Value="0" />' +
      '<IsDefaultFadeIn Value="true" /><IsDefaultFadeOut Value="true" />' +
      "</Fades></AudioClip>";
    const f = getFades(clipOhneSkew);

    expect(f.FadeInLength).toBe("3");
    expect(f.FadeInCurveSkew).toBe("0");
    expect(f.FadeOutCurveSlope).toBe("0");
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
  it("FadeOut-Skew/Slope + direkte FadeIn-Skew/Slope set-gesperrt (Slice 4c)", () => {
    // FadeOut-Kurve NICHT byte-belegt -> 4c. Direkte FadeInCurveSkew/Slope
    // ebenfalls gesperrt: nur die up/down-Tupel sind byte-belegt, freigeschaltet
    // ausschließlich über den Composite-Key FadeInCurve.
    expect(() => patchFade(AUDIO, "FadeInCurveSkew", "0.5")).toThrow(
      /4c|nicht unterstützt/i,
    );
    expect(() => patchFade(AUDIO, "FadeInCurveSlope", "0.5")).toThrow(
      /4c|nicht unterstützt/i,
    );
    expect(() => patchFade(AUDIO, "FadeOutCurveSkew", "0.5")).toThrow(
      /4c|nicht unterstützt/i,
    );
    expect(() => patchFade(AUDIO, "FadeOutCurveSlope", "0.5")).toThrow(
      /4c|nicht unterstützt/i,
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
  it("<Fades>-Kind-Tag fehlt im vorhandenen <Fades>-Block wirft (line 133/134)", () => {
    // <Fades> ist da, aber FadeOutLength-Tag fehlt darin -> Replace-Regex
    // findet nichts -> "Tag <FadeOutLength> in <Fades> nicht gefunden"
    const clipOhneFadeOutLength =
      '<AudioClip Id="4"><Name Value="OF" />' +
      '<WarpMode Value="0" />' +
      '<Fade Value="true" />' +
      "<Fades>" +
      '<FadeInLength Value="0" />' +
      '<ClipFadesAreInitialized Value="true" /><CrossfadeInState Value="0" />' +
      '<IsDefaultFadeIn Value="true" /><IsDefaultFadeOut Value="true" />' +
      "</Fades></AudioClip>";

    expect(() =>
      patchFade(clipOhneFadeOutLength, "FadeOutLength", "1.0"),
    ).toThrow(/<fadeoutlength>.*<fades>.*nicht gefunden/i);
  });
  it("<Fade>-Tag fehlt im Positions-Fenster wirft (line 243/244)", () => {
    // <WarpMode> und <Fades> vorhanden, aber kein <Fade Value=...> im Fenster
    // dazwischen -> win.match(tagRe) === null
    const clipOhneFadeImFenster =
      '<AudioClip Id="5"><Name Value="NFW" />' +
      '<WarpMode Value="0" />' +
      "<Fades>" +
      '<FadeInLength Value="0" /><FadeOutLength Value="0" />' +
      '<ClipFadesAreInitialized Value="true" /><CrossfadeInState Value="0" />' +
      '<IsDefaultFadeIn Value="true" /><IsDefaultFadeOut Value="true" />' +
      "</Fades></AudioClip>";

    expect(() => patchFade(clipOhneFadeImFenster, "Fade", "false")).toThrow(
      /<fade>.*positions-fenster.*nicht gefunden/i,
    );
  });
  it("Skew/Slope-Sperrmeldung enthält exakt 'Slice 4c' (Wortlaut eingefroren)", () => {
    // Wortlaut der set-Sperre für die 4 rohen Skew/Slope-Keys festgenagelt:
    // jetzt 4c (FadeOut-Kurve + direkte FadeIn-Skew/Slope nicht byte-belegt).
    for (const key of [
      "FadeInCurveSkew",
      "FadeInCurveSlope",
      "FadeOutCurveSkew",
      "FadeOutCurveSlope",
    ]) {
      expect(() => patchFade(AUDIO, key, "0.5")).toThrow(/Slice 4c/);
    }
  });
  it("<Fade>-Tag mehrfach im Positions-Fenster wirft mehrdeutig (line 245/246)", () => {
    // Zwei <Fade Value=...> zwischen <WarpMode> und <Fades> -> hits.length !== 1
    const clipMitZweiFades =
      '<AudioClip Id="6"><Name Value="DF" />' +
      '<WarpMode Value="0" />' +
      '<Fade Value="true" />' +
      '<Fade Value="false" />' +
      "<Fades>" +
      '<FadeInLength Value="0" /><FadeOutLength Value="0" />' +
      '<ClipFadesAreInitialized Value="true" /><CrossfadeInState Value="0" />' +
      '<IsDefaultFadeIn Value="true" /><IsDefaultFadeOut Value="true" />' +
      "</Fades></AudioClip>";

    expect(() => patchFade(clipMitZweiFades, "Fade", "false")).toThrow(
      /<fade>.*2-mal.*mehrdeutig/i,
    );
  });
});

describe("Slice4b FadeInCurve Composite-Key (G4b-byte-belegt)", () => {
  it("FadeInCurve=up schreibt byte-belegte up-Tupel + IsDefaultFadeIn=false", () => {
    const out = patchFade(AUDIO, "FadeInCurve", "up");

    expect(out).toContain(`<FadeInCurveSkew Value="${SKEW_UP}" />`);
    expect(out).toContain(`<FadeInCurveSlope Value="${SLOPE_UP}" />`);
    expect(out).toContain('<IsDefaultFadeIn Value="false" />');
  });

  it("FadeInCurve=down schreibt byte-belegte down-Tupel + IsDefaultFadeIn=false", () => {
    const out = patchFade(AUDIO, "FadeInCurve", "down");

    expect(out).toContain(`<FadeInCurveSkew Value="${SKEW_DOWN}" />`);
    expect(out).toContain(`<FadeInCurveSlope Value="${SLOPE_DOWN}" />`);
    expect(out).toContain('<IsDefaultFadeIn Value="false" />');
  });

  it("FadeInCurve atomar: NUR die 3 Ziel-Tags ändern sich, Rest byte-identisch", () => {
    const out = patchFade(AUDIO, "FadeInCurve", "up");
    const restored = out
      .replace(
        `<FadeInCurveSkew Value="${SKEW_UP}" />`,
        '<FadeInCurveSkew Value="0" />',
      )
      .replace(
        `<FadeInCurveSlope Value="${SLOPE_UP}" />`,
        '<FadeInCurveSlope Value="0" />',
      )
      .replace(
        '<IsDefaultFadeIn Value="false" />',
        '<IsDefaultFadeIn Value="true" />',
      );

    expect(restored).toBe(AUDIO);
  });

  it("FadeInCurve berührt FadeOut-Skew/Slope NICHT (nur FadeIn)", () => {
    const out = patchFade(AUDIO, "FadeInCurve", "down");

    expect(out).toContain('<FadeOutCurveSkew Value="0" />');
    expect(out).toContain('<FadeOutCurveSlope Value="0" />');
    expect(out).toContain('<IsDefaultFadeOut Value="true" />');
  });

  it("FadeInCurve lässt <Fade>-bool (sibling, off-window) byte-identisch", () => {
    const out = patchFade(AUDIO, "FadeInCurve", "up");

    expect(out.match(/<Fade Value="[^"]*" \/>/)![0]).toBe(
      '<Fade Value="true" />',
    );
  });

  it("FadeInCurve nur up|down (ungültiger Wert wirft)", () => {
    expect(() => patchFade(AUDIO, "FadeInCurve", "sideways")).toThrow(
      /up|down/i,
    );
    expect(() => patchFade(AUDIO, "FadeInCurve", "0.5")).toThrow(/up|down/i);
  });

  it("FadeInCurve wirft wenn ein Ziel-Tag im <Fades> fehlt (kein Partial-Patch)", () => {
    // <Fades> vorhanden, aber FadeInCurveSlope-Tag fehlt -> patchFadeInCurve
    // wirft vor jeder Mutation (atomar, kein halb-gepatchter Block).
    const clipOhneSlope =
      '<AudioClip Id="30"><Name Value="NSL" />' +
      '<WarpMode Value="0" />' +
      '<Fade Value="true" />' +
      "<Fades>" +
      '<FadeInLength Value="0" /><FadeOutLength Value="0" />' +
      '<ClipFadesAreInitialized Value="true" /><CrossfadeInState Value="0" />' +
      '<FadeInCurveSkew Value="0" />' +
      '<IsDefaultFadeIn Value="true" /><IsDefaultFadeOut Value="true" />' +
      "</Fades></AudioClip>";

    expect(() => patchFade(clipOhneSlope, "FadeInCurve", "up")).toThrow(
      /<fadeincurveslope>.*<fades>.*nicht gefunden/i,
    );
  });
  it("FadeInCurve wirft bei fehlendem <Fades> (MidiClip-artig)", () => {
    expect(() =>
      patchFade('<MidiClip><Name Value="M" /></MidiClip>', "FadeInCurve", "up"),
    ).toThrow(/fades|audioclip/i);
  });
  it("getFades leitet FadeInCurve aus Skew-Literal ab (Verify-Witness)", () => {
    expect(getFades(AUDIO).FadeInCurve).toBe("0");
    expect(getFades(patchFade(AUDIO, "FadeInCurve", "up")).FadeInCurve).toBe(
      SKEW_UP,
    );
    expect(getFades(patchFade(AUDIO, "FadeInCurve", "down")).FadeInCurve).toBe(
      SKEW_DOWN,
    );
  });
});

describe("Slice4b FadeInLength/FadeOutLength große Werte (G4b: keine Obergrenze)", () => {
  it("große FadeInLength (1.9004591762404262) geht durch (byte-belegt)", () => {
    const out = patchFade(AUDIO, "FadeInLength", "1.9004591762404262");

    expect(out).toContain('<FadeInLength Value="1.9004591762404262" />');
  });

  it("große FadeOutLength (2.2789080710955711) geht durch (byte-belegt)", () => {
    const out = patchFade(AUDIO, "FadeOutLength", "2.2789080710955711");

    expect(out).toContain('<FadeOutLength Value="2.2789080710955711" />');
  });
});

describe("Slice4b byte-Konformität gegen G4b-Fixture <After> (T4)", () => {
  // Struktureller Soll-Vergleich: das von patchFade erzeugte <Fades> muss
  // die im Fixture <After> dokumentierten Skew/Slope-Literale + IsDefault-Flip
  // + Längen-Float exakt enthalten. Werte AUSSCHLIESSLICH aus der Fixture.
  it("clipIndex=0: FadeInCurve=up + FadeInLength == Fixture <After>", () => {
    const after = fixtureAfter(0);
    const len = after.match(/<FadeInLength Value="([^"]*)" \/>/)![1]!;
    let out = patchFade(AUDIO, "FadeInCurve", "up");

    out = patchFade(out, "FadeInLength", len);
    expect(out).toContain(`<FadeInLength Value="${len}" />`);
    expect(out).toContain('<FadeInCurveSkew Value="-1" />');
    expect(out).toContain('<FadeInCurveSlope Value="0.8999999762" />');
    expect(out).toContain('<IsDefaultFadeIn Value="false" />');
  });

  it("clipIndex=1: FadeInCurve=down == Fixture <After> (Skew/Slope/IsDefault)", () => {
    const after = fixtureAfter(1);

    expect(after).toContain('<FadeInCurveSkew Value="1" />');
    expect(after).toContain('<FadeInCurveSlope Value="-0.8999999762" />');
    expect(after).toContain('<IsDefaultFadeIn Value="false" />');
    const out = patchFade(AUDIO, "FadeInCurve", "down");

    expect(out).toContain('<FadeInCurveSkew Value="1" />');
    expect(out).toContain('<FadeInCurveSlope Value="-0.8999999762" />');
    expect(out).toContain('<IsDefaultFadeIn Value="false" />');
  });

  it("clipIndex=2: große FadeOutLength == Fixture <After>", () => {
    const after = fixtureAfter(2);
    const len = after.match(/<FadeOutLength Value="([^"]*)" \/>/)![1]!;
    const out = patchFade(AUDIO, "FadeOutLength", len);

    expect(out).toContain(`<FadeOutLength Value="${len}" />`);
    expect(len).toBe("2.2789080710955711");
  });
});
