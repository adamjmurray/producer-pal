// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  CLIP_SETTING_SPEC,
  getClipSettings,
  patchClipSetting,
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
// resolveEnumValue(key, v) + ENUM_TABLES in src/automation/als-clip-settings.ts.
// BLOCKIERT: G3'-Ground-Truth-Fixture
// (docs/superpowers/fixtures/ableton12-clip-settings-groundtruth.xml) fehlt
// noch. Konkrete Integer<->Name-Paare duerfen NICHT spekuliert werden
// (Recon-Gate-Disziplin) -- erst nach Fixture-Lieferung byte-belegen.
// resolveEnumValue/ENUM_TABLES existieren noch nicht und werden hier bewusst
// NICHT importiert (Import wuerde typecheck/Gate brechen). Muster analog
// 4b-T2 (commit fe1a23c7): benannte TODOs + it.todo, keine spekulativen Werte.
// ---------------------------------------------------------------------------
describe("Slice-3 T5 Enum-Namens-Validierung (fixture-frei, BLOCKIERT durch G3')", () => {
  it.todo(
    "resolveEnumValue: FollowActionA Name -> Int byte-belegt aus G3'-Ground-Truth (Paare nach Fixture-Lieferung)",
  );
  it.todo("resolveEnumValue: FollowActionB analog G3'");
  it.todo("resolveEnumValue: LaunchMode 0-3 Name<->Int aus G3'");
  it.todo("resolveEnumValue: LaunchQuantisation-Stufen aus G3'");
  it.todo(
    "resolveEnumValue: unbekannter Enum-Name wirft mit Liste erlaubter Namen",
  );
  it.todo(
    "resolveEnumValue: Roh-Integer wird weiterhin durchgereicht (T2-Regression bleibt grün)",
  );
});
