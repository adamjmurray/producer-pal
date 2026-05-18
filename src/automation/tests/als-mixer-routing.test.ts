// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import {
  getCrossFadeAssign,
  getSendPreBools,
  patchCrossFadeAssign,
  patchSendPreBool,
} from "#src/automation/als-mixer-routing.ts";
import { locateTrackBlock } from "#src/automation/als-param-resolver.ts";

// Mixer-Block mit kollidierendem Volume-<Manual> VOR CrossFadeState.
const TRACK_BLOCK = `<MidiTrack Id="9">
  <DeviceChain><Mixer>
    <Volume><LomId Value="0" /><Manual Value="0.5" /></Volume>
    <Pan><Manual Value="0" /></Pan>
    <CrossFadeState>
      <LomId Value="0" />
      <Manual Value="1" />
      <MidiControllerRange><Min Value="0" /><Max Value="2" /></MidiControllerRange>
    </CrossFadeState>
  </Mixer></DeviceChain>
</MidiTrack>`;

describe("patchCrossFadeAssign", () => {
  it("setzt CrossFadeState-Manual auf B (2) ohne Volume-Manual zu treffen", () => {
    const out = patchCrossFadeAssign(TRACK_BLOCK, 2);

    expect(out).toContain(
      '<Volume><LomId Value="0" /><Manual Value="0.5" /></Volume>',
    );
    expect(out).toContain('<Pan><Manual Value="0" /></Pan>');
    expect(/<CrossFadeState>[\S\s]*?<Manual Value="2" \/>/.test(out)).toBe(
      true,
    );
  });

  it("akzeptiert 0 und 1", () => {
    expect(patchCrossFadeAssign(TRACK_BLOCK, 0)).toMatch(
      /<CrossFadeState>[\S\s]*?<Manual Value="0" \/>/,
    );
    expect(patchCrossFadeAssign(TRACK_BLOCK, 1)).toMatch(
      /<CrossFadeState>[\S\s]*?<Manual Value="1" \/>/,
    );
  });

  it("wirft bei Wert ausserhalb {0,1,2}", () => {
    expect(() => patchCrossFadeAssign(TRACK_BLOCK, 3)).toThrow(
      /0\|1\|2|A\|center\|B/,
    );
  });

  it("wirft wenn CrossFadeState fehlt", () => {
    expect(() => patchCrossFadeAssign("<MidiTrack></MidiTrack>", 1)).toThrow(
      /CrossFadeState/,
    );
  });
});

describe("getCrossFadeAssign", () => {
  it("liest Center (1)", () => {
    expect(getCrossFadeAssign(TRACK_BLOCK)).toBe(1);
  });

  it("wirft wenn CrossFadeState fehlt", () => {
    expect(() => getCrossFadeAssign("<MidiTrack></MidiTrack>")).toThrow(
      /CrossFadeState/,
    );
  });
});

const SENDS_PRE = `<LiveSet>
  <SendsPre>
    <SendPreBool Id="3" Value="false" />
    <SendPreBool Id="1" Value="false" />
  </SendsPre>
  <Scenes></Scenes></LiveSet>`;

describe("patchSendPreBool", () => {
  it("setzt nur die Ziel-Id auf true, andere unveraendert", () => {
    const out = patchSendPreBool(SENDS_PRE, 3, true);

    expect(out).toContain('<SendPreBool Id="3" Value="true" />');
    expect(out).toContain('<SendPreBool Id="1" Value="false" />');
  });

  it("setzt false", () => {
    const out = patchSendPreBool(
      patchSendPreBool(SENDS_PRE, 1, true),
      1,
      false,
    );

    expect(out).toContain('<SendPreBool Id="1" Value="false" />');
  });

  it("wirft bei unbekannter returnId mit Id-Liste", () => {
    expect(() => patchSendPreBool(SENDS_PRE, 99, true)).toThrow(/3.*1|1.*3/);
  });

  it("wirft wenn SendsPre fehlt", () => {
    expect(() => patchSendPreBool("<LiveSet></LiveSet>", 1, true)).toThrow(
      /SendsPre/,
    );
  });
});

describe("getSendPreBools", () => {
  it("liest alle Ids", () => {
    expect(getSendPreBools(SENDS_PRE)).toStrictEqual({ 3: false, 1: false });
  });

  it("wirft wenn SendsPre fehlt", () => {
    expect(() => getSendPreBools("<LiveSet></LiveSet>")).toThrow(/SendsPre/);
  });
});

describe("Anker-Rand-Branches", () => {
  const CROSS_NO_MANUAL =
    '<CrossFadeState><LomId Value="0" /></CrossFadeState>';

  it("patchCrossFadeAssign wirft wenn Block ohne <Manual>", () => {
    expect(() => patchCrossFadeAssign(CROSS_NO_MANUAL, 1)).toThrow(/Manual/);
  });

  it("getCrossFadeAssign wirft wenn Block ohne <Manual>", () => {
    expect(() => getCrossFadeAssign(CROSS_NO_MANUAL)).toThrow(/Manual/);
  });

  it("extractCrossFadeBlock wirft bei offenem Tag ohne Close", () => {
    expect(() =>
      getCrossFadeAssign('<CrossFadeState><Manual Value="1" />'),
    ).toThrow(/CrossFadeState/);
  });

  it("extractSendsPreBlock wirft bei offenem Tag ohne Close", () => {
    expect(() =>
      getSendPreBools('<SendsPre><SendPreBool Id="1" Value="false" />'),
    ).toThrow(/SendsPre/);
  });

  it("getCrossFadeAssign wirft bei nicht-numerischem Manual", () => {
    expect(() =>
      getCrossFadeAssign(
        '<CrossFadeState><Manual Value="x" /></CrossFadeState>',
      ),
    ).toThrow(/ungueltig/);
  });
});

// Spec §5: Modul-Roundtrip gegen >=2 ECHTE Sets (nicht nur synthetisch).
describe("echte Sets (Spec §5 Roundtrip)", () => {
  const SETS: ReadonlyArray<[string, string, Record<number, boolean>]> = [
    [
      "e2e/live-sets/e2e-test-set Project/e2e-test-set.als",
      "Drums",
      { 3: false, 1: false },
    ],
    [
      "e2e/live-sets/arrangement-clip-tests Project/arrangement-clip-tests.als",
      "1. MIDI - Looped",
      { 0: false, 1: false },
    ],
  ];

  it.each(SETS)(
    "%s: CrossFade Center→B Roundtrip + SendPreBools",
    (path, track, sendPre) => {
      const xml = readAls(path);
      const loc = locateTrackBlock(xml, track);

      expect(getCrossFadeAssign(loc.block)).toBe(1);

      const patched = patchCrossFadeAssign(loc.block, 2);

      expect(getCrossFadeAssign(patched)).toBe(2);
      expect(getSendPreBools(xml)).toStrictEqual(sendPre);
    },
  );
});
