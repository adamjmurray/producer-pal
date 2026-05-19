// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import {
  getArrangementLoop,
  patchArrangementLoop,
} from "#src/automation/als-arrangement-loop.ts";

const SET = "e2e/live-sets/e2e-test-set Project/e2e-test-set.als";
const XML = readAls(SET);

// Ein echter Clip-`<Loop>`-Block (LoopEnd-Seite, KEIN LoopLength). Dient als
// Abgrenzungs-Regression: dieser Substring darf nach keinem Transport-Patch
// abweichen (R1 — LoopOn/LoopStart-Namen kommen auch clip-seitig vor).
const CLIP_LOOP_SUBSTR = (() => {
  const m = XML.match(/<Loop>[\S\s]*?<LoopEnd Value="[^"]*"[\S\s]*?<\/Loop>/);

  if (m == null) throw new Error("Test-Setup: kein Clip-<Loop> im echten Set");

  return m[0];
})();

describe("getArrangementLoop", () => {
  it("liest LoopOn/LoopStart/LoopLength aus dem eindeutigen <Transport>", () => {
    expect(getArrangementLoop(XML)).toStrictEqual({
      on: true,
      start: "32",
      length: "32",
    });
  });

  it("liefert konsistenten Default ohne Throw bei fehlendem Loop-Tag", () => {
    const stripped = XML.replace(/<LoopLength Value="[^"]*" \/>/, "");

    expect(getArrangementLoop(stripped)).toStrictEqual({
      on: true,
      start: "32",
      length: "",
    });
  });

  it("liefert Voll-Default bei fehlendem <Transport>", () => {
    expect(getArrangementLoop("<Ableton></Ableton>")).toStrictEqual({
      on: false,
      start: "",
      length: "",
    });
  });
});

describe("patchArrangementLoop", () => {
  it("patcht nur LoopOn (false), LoopStart/LoopLength unveraendert", () => {
    const out = patchArrangementLoop(XML, { on: false });

    expect(getArrangementLoop(out)).toStrictEqual({
      on: false,
      start: "32",
      length: "32",
    });
    expect(out).toContain(CLIP_LOOP_SUBSTR);
  });

  it("patcht LoopOn true (true-Arm der on-Ternary)", () => {
    const off = patchArrangementLoop(XML, { on: false });
    const out = patchArrangementLoop(off, { on: true });

    expect(getArrangementLoop(out)).toStrictEqual({
      on: true,
      start: "32",
      length: "32",
    });
  });

  it("patcht nur LoopStart (16)", () => {
    const out = patchArrangementLoop(XML, { start: "16" });

    expect(getArrangementLoop(out)).toStrictEqual({
      on: true,
      start: "16",
      length: "32",
    });
  });

  it("patcht nur LoopLength (8)", () => {
    const out = patchArrangementLoop(XML, { length: "8" });

    expect(getArrangementLoop(out)).toStrictEqual({
      on: true,
      start: "32",
      length: "8",
    });
  });

  it("patcht kombiniert, Float-String woertlich erhalten", () => {
    const out = patchArrangementLoop(XML, {
      on: false,
      start: "4.5",
      length: "2",
    });

    expect(getArrangementLoop(out)).toStrictEqual({
      on: false,
      start: "4.5",
      length: "2",
    });
    expect(out).toContain('<LoopStart Value="4.5" />');
  });

  it("Clip-<Loop>-Bloecke bleiben byte-unveraendert (Abgrenzung)", () => {
    const out = patchArrangementLoop(XML, {
      on: false,
      start: "1",
      length: "1",
    });

    expect(out).toContain(CLIP_LOOP_SUBSTR);
    expect(out.match(/<LoopEnd Value=/g) ?? []).toHaveLength(
      (XML.match(/<LoopEnd Value=/g) ?? []).length,
    );
  });

  it("aendert ausschliesslich Bytes im <Transport>-Block", () => {
    const out = patchArrangementLoop(XML, { on: false });
    const re = /<Transport>[\S\s]*?<\/Transport>/;
    const a = XML.match(re);
    const b = out.match(re);

    if (a?.index == null || b?.index == null) throw new Error("kein Transport");

    expect(out.slice(0, b.index)).toBe(XML.slice(0, a.index));
    expect(out.slice(b.index + b[0].length)).toBe(
      XML.slice(a.index + a[0].length),
    );
  });

  it("wirft bei leerer Patch-Menge", () => {
    expect(() => patchArrangementLoop(XML, {})).toThrow();
  });

  it("wirft bei fehlendem <Transport>", () => {
    expect(() =>
      patchArrangementLoop("<Ableton></Ableton>", { on: true }),
    ).toThrow();
  });

  it("wirft bei fehlendem Ziel-Tag (kein Teil-Patch)", () => {
    const stripped = XML.replace(/<LoopStart Value="32" \/>/, "");

    expect(() => patchArrangementLoop(stripped, { start: "8" })).toThrow();
  });
});
