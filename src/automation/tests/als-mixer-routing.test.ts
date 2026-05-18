// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  getCrossFadeAssign,
  patchCrossFadeAssign,
} from "#src/automation/als-mixer-routing.ts";

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
    expect(out).toContain('<Volume><LomId Value="0" /><Manual Value="0.5" /></Volume>');
    expect(out).toContain('<Pan><Manual Value="0" /></Pan>');
    expect(/<CrossFadeState>[\s\S]*?<Manual Value="2" \/>/.test(out)).toBe(true);
  });

  it("akzeptiert 0 und 1", () => {
    expect(patchCrossFadeAssign(TRACK_BLOCK, 0)).toMatch(/<CrossFadeState>[\s\S]*?<Manual Value="0" \/>/);
    expect(patchCrossFadeAssign(TRACK_BLOCK, 1)).toMatch(/<CrossFadeState>[\s\S]*?<Manual Value="1" \/>/);
  });

  it("wirft bei Wert ausserhalb {0,1,2}", () => {
    expect(() => patchCrossFadeAssign(TRACK_BLOCK, 3)).toThrow(/0\|1\|2|A\|center\|B/);
  });

  it("wirft wenn CrossFadeState fehlt", () => {
    expect(() => patchCrossFadeAssign("<MidiTrack></MidiTrack>", 1)).toThrow(/CrossFadeState/);
  });
});

describe("getCrossFadeAssign", () => {
  it("liest Center (1)", () => {
    expect(getCrossFadeAssign(TRACK_BLOCK)).toBe(1);
  });

  it("wirft wenn CrossFadeState fehlt", () => {
    expect(() => getCrossFadeAssign("<MidiTrack></MidiTrack>")).toThrow(/CrossFadeState/);
  });
});
