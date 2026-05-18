// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  CLIP_SETTING_SPEC,
  ENUM_TABLES,
  getClipSettings,
  patchClipSetting,
  resolveEnumValue,
} from "../als-clip-settings.ts";

// Vollständige Recon-Reihenfolge des echten Clips:
// Color, LaunchMode, LaunchQuantisation, TimeSignature, TimeSelection,
// Legato, Ram, GrooveSettings, Disabled, VelocityAmount, FollowAction.
const CLIP =
  '<MidiClip Time="0"><Name Value="C" /><Color Value="58" />' +
  '<LaunchMode Value="0" /><LaunchQuantisation Value="0" />' +
  "<TimeSignature><Foo /></TimeSignature><TimeSelection><Bar /></TimeSelection>" +
  '<Legato Value="false" /><Ram Value="false" />' +
  '<GrooveSettings><GrooveId Value="-1" /></GrooveSettings>' +
  '<Disabled Value="false" />' +
  '<VelocityAmount Value="0" />' +
  "<FollowAction>" +
  '<FollowTime Value="4" /><IsLinked Value="true" /><LoopIterations Value="1" />' +
  '<FollowActionA Value="4" /><FollowActionB Value="0" />' +
  '<FollowChanceA Value="100" /><FollowChanceB Value="0" />' +
  '<JumpIndexA Value="1" /><JumpIndexB Value="1" />' +
  '<FollowActionEnabled Value="false" />' +
  "</FollowAction></MidiClip>";

describe("CLIP_SETTING_SPEC", () => {
  it("deckt genau die 14 Keys mit Tag/Typ/Default ab", () => {
    const keys = Object.keys(CLIP_SETTING_SPEC).sort();

    expect(keys).toStrictEqual(
      [
        "FollowActionA",
        "FollowActionB",
        "FollowActionEnabled",
        "FollowChanceA",
        "FollowChanceB",
        "FollowTime",
        "IsLinked",
        "JumpIndexA",
        "JumpIndexB",
        "LaunchMode",
        "LaunchQuantisation",
        "Legato",
        "LoopIterations",
        "VelocityAmount",
      ].sort(),
    );
    expect(CLIP_SETTING_SPEC.LaunchMode?.type).toBe("enum");
    expect(CLIP_SETTING_SPEC.Legato?.type).toBe("bool");
  });
});

describe("getClipSettings", () => {
  it("liest alle 14 Default-Werte aus dem Clip-Block", () => {
    const s = getClipSettings(CLIP);

    expect(s.LaunchMode).toBe("0");
    expect(s.Legato).toBe("false");
    expect(s.FollowActionA).toBe("4");
    expect(s.FollowActionEnabled).toBe("false");
  });
});

describe("patchClipSetting", () => {
  it("patcht LaunchMode (nach Color) ohne andere Bytes zu ändern", () => {
    const out = patchClipSetting(CLIP, "LaunchMode", "2");

    expect(out).toContain('<LaunchMode Value="2" />');
    expect(
      out.replace('<LaunchMode Value="2" />', '<LaunchMode Value="0" />'),
    ).toBe(CLIP);
  });
  it("patcht FollowAction-Kind nur innerhalb des FollowAction-Blocks", () => {
    const out = patchClipSetting(CLIP, "FollowChanceA", "50");

    expect(out).toContain('<FollowChanceA Value="50" />');
    expect(out.replace('Value="50"', 'Value="100"')).toBe(CLIP);
  });
  it("bool-Key akzeptiert nur true/false", () => {
    expect(() => patchClipSetting(CLIP, "Legato", "yes")).toThrow(/true|false/);
  });
  it("int-Key weist Nicht-Integer ab", () => {
    expect(() => patchClipSetting(CLIP, "FollowTime", "x")).toThrow(
      /integer|ganzzahl/i,
    );
  });
  it("unbekannter Key wirft mit Key-Liste", () => {
    expect(() => patchClipSetting(CLIP, "Nope", "1")).toThrow(
      /LaunchMode|FollowActionA/,
    );
  });
  it("fehlender Ziel-Tag im Clip wirft (kein Insert)", () => {
    expect(() =>
      patchClipSetting(
        '<MidiClip><Name Value="C" /></MidiClip>',
        "LaunchMode",
        "1",
      ),
    ).toThrow(/launchmode.*nicht/i);
  });
});

describe("patchClipSetting Positions-Anker (Plan-Anpassung A)", () => {
  it("Legato: trifft NUR das Fenster-Tag, gleichnamiges Tag außerhalb bleibt byte-identisch", () => {
    const clip =
      '<MidiClip Time="0"><Name Value="C" /><Color Value="58" />' +
      '<LaunchMode Value="0" /><LaunchQuantisation Value="0" />' +
      "<TimeSignature><Foo /></TimeSignature>" +
      "<TimeSelection><Bar /></TimeSelection>" +
      '<Legato Value="false" /><Ram Value="false" />' +
      '<VelocityAmount Value="0" />' +
      "<FollowAction>" +
      '<FollowTime Value="4" /><IsLinked Value="true" /><LoopIterations Value="1" />' +
      '<FollowActionA Value="4" /><FollowActionB Value="0" />' +
      '<FollowChanceA Value="100" /><FollowChanceB Value="0" />' +
      '<JumpIndexA Value="1" /><JumpIndexB Value="1" />' +
      '<FollowActionEnabled Value="false" />' +
      "</FollowAction>" +
      '<Extra><Legato Value="true" /></Extra></MidiClip>';
    const out = patchClipSetting(clip, "Legato", "true");

    // Fenster-Tag (zwischen </TimeSelection> und <Ram ) wurde gepatcht
    expect(out).toContain(
      '<TimeSelection><Bar /></TimeSelection><Legato Value="true" /><Ram Value="false" />',
    );
    // Off-Window-Tag bleibt unverändert
    expect(out).toContain('<Extra><Legato Value="true" /></Extra>');
    // genau eine Byte-Differenz zum Original
    expect(
      out.replace(
        '<TimeSelection><Bar /></TimeSelection><Legato Value="true" />',
        '<TimeSelection><Bar /></TimeSelection><Legato Value="false" />',
      ),
    ).toBe(clip);
  });

  it("LaunchMode: trifft NUR das Fenster-Tag, gleichnamiges Tag außerhalb bleibt byte-identisch", () => {
    const clip =
      '<MidiClip Time="0"><Name Value="C" /><Color Value="58" />' +
      '<LaunchMode Value="0" /><LaunchQuantisation Value="0" />' +
      '<TimeSignature><LaunchMode Value="9" /></TimeSignature>' +
      "<TimeSelection><Bar /></TimeSelection>" +
      '<Legato Value="false" /><Ram Value="false" />' +
      '<VelocityAmount Value="0" />' +
      "<FollowAction>" +
      '<FollowTime Value="4" /><IsLinked Value="true" /><LoopIterations Value="1" />' +
      '<FollowActionA Value="4" /><FollowActionB Value="0" />' +
      '<FollowChanceA Value="100" /><FollowChanceB Value="0" />' +
      '<JumpIndexA Value="1" /><JumpIndexB Value="1" />' +
      '<FollowActionEnabled Value="false" />' +
      "</FollowAction></MidiClip>";
    const out = patchClipSetting(clip, "LaunchMode", "3");

    // Fenster-Tag (zwischen <Color /> und <TimeSignature>) wurde gepatcht
    expect(out).toContain(
      '<Color Value="58" /><LaunchMode Value="3" /><LaunchQuantisation Value="0" />',
    );
    // Off-Window-Tag (innerhalb TimeSignature) bleibt unverändert
    expect(out).toContain(
      '<TimeSignature><LaunchMode Value="9" /></TimeSignature>',
    );
    expect(
      out.replace(
        '<Color Value="58" /><LaunchMode Value="3" />',
        '<Color Value="58" /><LaunchMode Value="0" />',
      ),
    ).toBe(clip);
  });

  it("VelocityAmount: patcht im Ram->FollowAction-Fenster, Rest byte-identisch", () => {
    const out = patchClipSetting(CLIP, "VelocityAmount", "5");

    expect(out).toContain('<VelocityAmount Value="5" />');
    expect(
      out.replace(
        '<VelocityAmount Value="5" />',
        '<VelocityAmount Value="0" />',
      ),
    ).toBe(CLIP);
  });

  it("VelocityAmount: gleichnamiges Tag außerhalb des Fensters bleibt unverändert", () => {
    const clip =
      '<MidiClip Time="0"><Name Value="C" /><Color Value="58" />' +
      '<LaunchMode Value="0" /><LaunchQuantisation Value="0" />' +
      "<TimeSignature><Foo /></TimeSignature>" +
      "<TimeSelection><Bar /></TimeSelection>" +
      '<Legato Value="false" /><Ram Value="false" />' +
      '<GrooveSettings><GrooveId Value="-1" /></GrooveSettings>' +
      '<Disabled Value="false" />' +
      '<VelocityAmount Value="0" />' +
      "<FollowAction>" +
      '<FollowTime Value="4" /><IsLinked Value="true" /><LoopIterations Value="1" />' +
      '<FollowActionA Value="4" /><FollowActionB Value="0" />' +
      '<FollowChanceA Value="100" /><FollowChanceB Value="0" />' +
      '<JumpIndexA Value="1" /><JumpIndexB Value="1" />' +
      '<FollowActionEnabled Value="false" />' +
      "</FollowAction>" +
      '<Extra><VelocityAmount Value="9" /></Extra></MidiClip>';
    const out = patchClipSetting(clip, "VelocityAmount", "5");

    expect(out).toContain(
      '<Disabled Value="false" /><VelocityAmount Value="5" /><FollowAction>',
    );
    // Off-Window-Tag bleibt byte-identisch
    expect(out).toContain('<Extra><VelocityAmount Value="9" /></Extra>');
    expect(
      out.replace(
        '<Disabled Value="false" /><VelocityAmount Value="5" />',
        '<Disabled Value="false" /><VelocityAmount Value="0" />',
      ),
    ).toBe(clip);
  });

  it("VelocityAmount: Clip OHNE <Ram >-Startmarker wirft mit Fenster/Marker-Meldung", () => {
    const clip =
      '<MidiClip Time="0"><Name Value="C" />' +
      '<VelocityAmount Value="0" /><FollowAction></FollowAction></MidiClip>';

    expect(() => patchClipSetting(clip, "VelocityAmount", "5")).toThrow(
      /anker.*startmarke fehlt/i,
    );
  });

  it("VelocityAmount: Fenster vorhanden aber kein <VelocityAmount> darin wirft Tag-nicht-gefunden", () => {
    const clip =
      '<MidiClip Time="0"><Name Value="C" /><Ram Value="false" />' +
      "<FollowAction></FollowAction></MidiClip>";

    expect(() => patchClipSetting(clip, "VelocityAmount", "5")).toThrow(
      /tag <velocityamount> im clip nicht gefunden/i,
    );
  });

  it("LaunchMode: Startmarke vorhanden aber Endmarke fehlt wirft mit Endmarke-Meldung", () => {
    const clip =
      '<MidiClip Time="0"><Name Value="C" /><Color Value="58" />' +
      '<LaunchMode Value="0" /></MidiClip>';

    expect(() => patchClipSetting(clip, "LaunchMode", "2")).toThrow(
      /anker.*endmarke fehlt/i,
    );
  });

  it("FollowAction-Key ohne <FollowAction>-Block wirft", () => {
    const clip = '<MidiClip Time="0"><Name Value="C" /></MidiClip>';

    expect(() => patchClipSetting(clip, "FollowTime", "8")).toThrow(
      /<followaction> im clip nicht gefunden/i,
    );
  });

  it("FollowAction-Block vorhanden aber Ziel-Tag darin fehlt wirft", () => {
    const clip =
      '<MidiClip Time="0"><Name Value="C" />' +
      '<FollowAction><IsLinked Value="true" /></FollowAction></MidiClip>';

    expect(() => patchClipSetting(clip, "FollowTime", "8")).toThrow(
      /<followtime> in <followaction> nicht gefunden/i,
    );
  });

  it("Top-Level-Scalar mehrfach im Fenster -> wirft (kein Off-Target)", () => {
    const clip =
      '<MidiClip Time="0"><Name Value="C" /><Color Value="58" />' +
      '<LaunchMode Value="0" /><LaunchMode Value="1" />' +
      '<LaunchQuantisation Value="0" />' +
      "<TimeSignature><Foo /></TimeSignature>" +
      "<TimeSelection><Bar /></TimeSelection>" +
      '<Legato Value="false" /><Ram Value="false" />' +
      '<VelocityAmount Value="0" />' +
      "<FollowAction>" +
      '<FollowTime Value="4" /><IsLinked Value="true" /><LoopIterations Value="1" />' +
      '<FollowActionA Value="4" /><FollowActionB Value="0" />' +
      '<FollowChanceA Value="100" /><FollowChanceB Value="0" />' +
      '<JumpIndexA Value="1" /><JumpIndexB Value="1" />' +
      '<FollowActionEnabled Value="false" />' +
      "</FollowAction></MidiClip>";

    expect(() => patchClipSetting(clip, "LaunchMode", "2")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Plan-Task 5 (docs/superpowers/plans/2026-05-17-ppal-clip-settings.md):
// resolveEnumValue(key, v) + ENUM_TABLES — Enum-Namens-Validierung.
// Konkrete Integer<->Name-Paare byte-belegt aus G3'-Ground-Truth-Fixture
// docs/superpowers/fixtures/ableton12-clip-settings-groundtruth.xml
// (Recon-Gate G3' GESCHLOSSEN). Keine Spekulation: exakt diese Paare.
//   FollowActionA/B (gemeinsame Action-Enum):
//     No Action=0 Stop=1 Play Again=2 Previous=3 Next=4
//     First=5 Last=6 Any=7 Other=8 Jump=9
//   LaunchMode: Trigger=0 Gate=1 Toggle=2 Repeat=3
//   LaunchQuantisation byte-belegt NUR: Global=0, 1 Bar=5
//     (weitere Stufen bleiben Roh-Int-Passthrough — Design, kein Mangel)
// ---------------------------------------------------------------------------
describe("Slice-3 T5 Enum-Namens-Validierung (G3'-Ground-Truth)", () => {
  it("ENUM_TABLES deckt genau die 4 Enum-Keys ab", () => {
    expect(Object.keys(ENUM_TABLES).sort()).toStrictEqual([
      "FollowActionA",
      "FollowActionB",
      "LaunchMode",
      "LaunchQuantisation",
    ]);
  });

  it("FollowActionA Name->Int exakt aus byte-Ground-Truth", () => {
    expect(resolveEnumValue("FollowActionA", "No Action")).toBe("0");
    expect(resolveEnumValue("FollowActionA", "Stop")).toBe("1");
    expect(resolveEnumValue("FollowActionA", "Play Again")).toBe("2");
    expect(resolveEnumValue("FollowActionA", "Previous")).toBe("3");
    expect(resolveEnumValue("FollowActionA", "Next")).toBe("4");
    expect(resolveEnumValue("FollowActionA", "First")).toBe("5");
    expect(resolveEnumValue("FollowActionA", "Last")).toBe("6");
    expect(resolveEnumValue("FollowActionA", "Any")).toBe("7");
    expect(resolveEnumValue("FollowActionA", "Other")).toBe("8");
    expect(resolveEnumValue("FollowActionA", "Jump")).toBe("9");
  });

  it("FollowActionB teilt die Action-Enum (gleiche Paare)", () => {
    expect(resolveEnumValue("FollowActionB", "No Action")).toBe("0");
    expect(resolveEnumValue("FollowActionB", "Next")).toBe("4");
    expect(resolveEnumValue("FollowActionB", "Jump")).toBe("9");
  });

  it("LaunchMode 0-3 Name<->Int aus G3'", () => {
    expect(resolveEnumValue("LaunchMode", "Trigger")).toBe("0");
    expect(resolveEnumValue("LaunchMode", "Gate")).toBe("1");
    expect(resolveEnumValue("LaunchMode", "Toggle")).toBe("2");
    expect(resolveEnumValue("LaunchMode", "Repeat")).toBe("3");
  });

  it("LaunchQuantisation NUR byte-belegte Stufen Global=0 / 1 Bar=5", () => {
    expect(resolveEnumValue("LaunchQuantisation", "Global")).toBe("0");
    expect(resolveEnumValue("LaunchQuantisation", "1 Bar")).toBe("5");
  });

  it("unbekannter Enum-Name wirft mit Liste erlaubter Namen", () => {
    expect(() => resolveEnumValue("FollowActionA", "Quatsch")).toThrow(
      /No Action.*Stop.*Play Again|Play Again.*Jump/,
    );
    expect(() => resolveEnumValue("LaunchMode", "Foo")).toThrow(
      /Trigger.*Gate.*Toggle.*Repeat/,
    );
  });

  it("Roh-Integer wird unverändert durchgereicht (auch 0 und negativ)", () => {
    expect(resolveEnumValue("FollowActionA", "7")).toBe("7");
    expect(resolveEnumValue("FollowActionA", "0")).toBe("0");
    expect(resolveEnumValue("LaunchMode", "2")).toBe("2");
    expect(resolveEnumValue("LaunchQuantisation", "13")).toBe("13");
    expect(resolveEnumValue("FollowActionB", "-1")).toBe("-1");
  });

  it("resolveEnumValue für Key ohne Enum-Tabelle reicht Roh-Int durch, wirft bei Namen", () => {
    expect(resolveEnumValue("FollowChanceA", "42")).toBe("42");
    expect(() => resolveEnumValue("FollowChanceA", "Foo")).toThrow(
      /FollowChanceA/,
    );
  });

  it("patchClipSetting löst Enum-Namen vor dem Schreiben auf (FollowActionA)", () => {
    // CLIP-Default FollowActionA=4; "Jump"->9 ist ein distinkter Wert,
    // damit die Byte-Differenz-Assertion echt greift.
    const out = patchClipSetting(CLIP, "FollowActionA", "Jump");

    expect(out).toContain('<FollowActionA Value="9" />');
    expect(
      out.replace('<FollowActionA Value="9" />', '<FollowActionA Value="4" />'),
    ).toBe(CLIP);
  });

  it("patchClipSetting löst LaunchMode-Namen auf (Top-Level positions-verankert)", () => {
    const out = patchClipSetting(CLIP, "LaunchMode", "Gate");

    expect(out).toContain('<LaunchMode Value="1" />');
    expect(
      out.replace('<LaunchMode Value="1" />', '<LaunchMode Value="0" />'),
    ).toBe(CLIP);
  });

  it("patchClipSetting Roh-Int-Pfad für Enum unverändert (T2-Regression)", () => {
    const out = patchClipSetting(CLIP, "LaunchMode", "2");

    expect(out).toContain('<LaunchMode Value="2" />');
    expect(
      out.replace('<LaunchMode Value="2" />', '<LaunchMode Value="0" />'),
    ).toBe(CLIP);
  });

  it("patchClipSetting wirft bei unbekanntem Enum-Namen", () => {
    expect(() => patchClipSetting(CLIP, "FollowActionA", "Nonsense")).toThrow(
      /No Action|Jump/,
    );
  });
});
