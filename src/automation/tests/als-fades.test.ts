// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { FADE_SPEC, getFades, patchFade } from "../als-fades.ts";

// Platzhalter-Sonden für den künftigen Skew/Slope/Crossfade-Schreibpfad
// (Slice 4b / Task 3). KEINE Range-, Vorzeichen- oder Enum-Annahme — der
// reale Wertebereich wird erst durch die G4b-Ground-Truth (Ableton-Roundtrip)
// festgelegt. Diese Konstanten dienen ausschließlich der Patch-Mechanik-Probe.
const SKEW_PROBE = "0.5"; // TODO(T3): durch G4b-Ground-Truth-Wert ersetzen
const SLOPE_PROBE = "0.5"; // TODO(T3): durch G4b-Ground-Truth-Wert ersetzen
const CROSSFADE_PROBE = "1"; // TODO(T3): durch G4b-Ground-Truth-Wert ersetzen

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
  it("Slice4b-Sperrmeldung enthält exakt 'Slice 4b' (Wortlaut eingefroren)", () => {
    // Bestehender Test oben matcht /4b|gekrümmt|nicht unterstützt/ (tolerant).
    // Hier wird der exakte Token 'Slice 4b' je Key festgenagelt, damit eine
    // spätere Umformulierung der Meldung bewusst rot wird (Charakterisierung).
    for (const key of [
      "FadeInCurveSkew",
      "FadeInCurveSlope",
      "FadeOutCurveSkew",
      "FadeOutCurveSlope",
    ]) {
      expect(() => patchFade(AUDIO, key, "0.5")).toThrow(/Slice 4b/);
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

describe("Slice4b Schreibpfad-Vertrag (fixture-frei, Mechanik-Probe)", () => {
  // Diese Suite dokumentiert den KÜNFTIGEN Skew/Slope/Crossfade-Schreibpfad.
  // Solange die SKEW_SLOPE_KEYS-Sperre in als-fades.ts aktiv ist, ist der
  // Vertrag = "wirft". Das wird hier als grüner Test ausgedrückt (der Throw
  // IST aktuell das korrekte Verhalten). Sobald T3 die Sperre entfernt, wird
  // dieser Test bewusst rot und zwingt zur Umstellung auf die it.todo-Asserts.
  it("RED-Vertrag: Skew-Patch wirft noch (Sperre aktiv, wird in T3 grün)", () => {
    expect(() => patchFade(AUDIO, "FadeInCurveSkew", SKEW_PROBE)).toThrow(
      /Slice 4b/,
    );
  });
  it("RED-Vertrag: Slope-Patch wirft noch (Sperre aktiv, wird in T3 grün)", () => {
    expect(() => patchFade(AUDIO, "FadeOutCurveSlope", SLOPE_PROBE)).toThrow(
      /Slice 4b/,
    );
  });

  // Künftiger Vertrag — KEINE Range-/Vorzeichen-/Enum-Annahme. Erst aktivieren,
  // wenn der Schreibpfad existiert und die G4b-Ground-Truth die Probe-Werte
  // gesetzt hat. Reine Patch-Mechanik (genau-1-Tag ersetzt, Rest byte-identisch).
  it.todo(
    "T3: patchFade(audioClip,'FadeInCurveSkew',SKEW_PROBE) ersetzt NUR den Skew-Tag, Rest byte-identisch",
  );
  it.todo(
    "T3: patchFade(audioClip,'FadeOutCurveSlope',SLOPE_PROBE) ersetzt NUR den Slope-Tag, Rest byte-identisch",
  );
  it.todo(
    "T3: Multi-Patch Skew+Slope+CrossfadeInState atomar (alle drei gesetzt, kein anderer Tag verändert)",
  );
  it.todo(
    "T3: Off-Window-Schutz — Skew/Slope-Patch verändert <Fade>-bool außerhalb <Fades> NICHT (R1-Analogon)",
  );
  it.todo(
    `T3: CrossfadeInState-Schreibpfad akzeptiert G4b-Ground-Truth (Probe ${CROSSFADE_PROBE}), Wertebereich erst durch Ableton-Roundtrip fixiert`,
  );
});
