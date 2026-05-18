// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  CLIP_FLAG_SPEC,
  patchClipFlag,
  getClipFlags,
} from "#src/automation/als-clip-flags.ts";

const SET = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";
const readXml = (): string => gunzipSync(readFileSync(SET)).toString("utf8");

/**
 * Ersten AudioClip-Block roh aus dem Set ziehen (Test-Single-Source).
 *
 * @param xml - Roher (dekomprimierter) `.als`-XML-String.
 * @returns Der erste `<AudioClip ...>...</AudioClip>`-Block-String.
 */
function firstAudioClip(xml: string): string {
  const s = xml.indexOf("<AudioClip ");

  return xml.slice(s, xml.indexOf("</AudioClip>", s) + "</AudioClip>".length);
}

describe("Slice-7 als-clip-flags", () => {
  it("CLIP_FLAG_SPEC enthält die 4 Flags exakt", () => {
    expect(CLIP_FLAG_SPEC).toStrictEqual({
      Ram: { tag: "Ram", type: "bool", def: "false" },
      HiQ: { tag: "HiQ", type: "bool", def: "true" },
      IsWarped: { tag: "IsWarped", type: "bool", def: "true" },
      WarpMode: { tag: "WarpMode", type: "int", def: "0" },
    });
  });

  it("patchClipFlag setzt HiQ true→false byte-treu (1× im Block)", () => {
    const c = firstAudioClip(readXml());
    const out = patchClipFlag(c, "HiQ", "false");

    expect(out).toContain('<HiQ Value="false" />');
    expect([...out.matchAll(/<HiQ Value=/g)]).toHaveLength(1);
  });

  it("patchClipFlag WarpMode roh 0→3", () => {
    const c = firstAudioClip(readXml());

    expect(patchClipFlag(c, "WarpMode", "3")).toContain(
      '<WarpMode Value="3" />',
    );
  });

  it("patchClipFlag ändert nur den Ziel-Tag (Rest byte-identisch)", () => {
    const c = firstAudioClip(readXml());
    const out = patchClipFlag(c, "Ram", "true");
    // genau 1 Zeichen-Region geändert: Rest exakt gleich
    const i = c.indexOf("<Ram Value=");
    const j = c.indexOf("/>", i) + 2;

    expect(out.slice(0, i)).toBe(c.slice(0, i));
    expect(out.slice(out.indexOf("/>", i) + 2)).toBe(c.slice(j));
  });

  it("patchClipFlag wirft bei fehlendem Tag (MidiClip-Block)", () => {
    expect(() =>
      patchClipFlag("<MidiClip></MidiClip>", "HiQ", "false"),
    ).toThrow(/HiQ/);
  });

  it("patchClipFlag wirft bei unbekanntem Flag", () => {
    expect(() =>
      patchClipFlag(firstAudioClip(readXml()), "Bogus", "1"),
    ).toThrow(/bogus|unbekannt/i);
  });

  it("patchClipFlag wirft bei ungültigem bool-Wert", () => {
    expect(() =>
      patchClipFlag(firstAudioClip(readXml()), "HiQ", "yes"),
    ).toThrow(/true|false|bool/i);
  });

  it("patchClipFlag wirft bei nicht-ganzzahligem int (WarpMode)", () => {
    expect(() =>
      patchClipFlag(firstAudioClip(readXml()), "WarpMode", "1.5"),
    ).toThrow(/int|ganzzahlig|integer/i);
  });

  it("getClipFlags liest die 4 aktuellen Werte", () => {
    const f = getClipFlags(firstAudioClip(readXml()));

    expect(f.HiQ).toMatch(/true|false/);
    expect(f.WarpMode).toMatch(/^-?\d+$/);
  });
});

describe("G7'-gated: WarpMode-Enum-Namen (Roh-Int funktioniert ohne)", () => {
  // Beats/Tones/Texture/Re-Pitch/Complex/Complex Pro ↔ Int byte-ableiten
  // aus User-Fixture (Slice-3-T5/G3'-Muster).
  it.todo("WarpMode-Name 'Complex' → byte-belegten Enum-Int");
});
