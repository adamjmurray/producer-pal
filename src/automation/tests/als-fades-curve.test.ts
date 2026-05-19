// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { readAls } from "#src/automation/als-file.ts";
import {
  getFadeOutCurve,
  patchFadeOutCurve,
} from "#src/automation/als-fades-curve.ts";
import { locateClipBlock } from "#src/automation/als-envelope-writer.ts";

const DIR = "e2e/live-sets/4c-fixtures/4c-fadeout-base Project";
const CLIP = "Wurli Piano Dmin";

// src-intern: locateClipBlock(xml, clipName) → {start,end,block} (by Name,
// kein Track nötig). KEIN scripts-Import aus src-Tests (Layer/Alias).
function clipBlock(file: string): string {
  const xml = readAls(`${DIR}/${file}`);

  return locateClipBlock(xml, CLIP).block;
}

describe("patchFadeOutCurve", () => {
  it("schreibt das up-Tupel woertlich, FadeIn/Length unveraendert", () => {
    const before = clipBlock("4c-fadeout-base.als");
    const out = patchFadeOutCurve(before, "up");

    expect(out).toContain('<FadeOutCurveSkew Value="-1" />');
    expect(out).toContain('<FadeOutCurveSlope Value="-0.8999999762" />');
    // Diff-Isolation: FadeIn + Laenge + IsDefaultFadeOut unveraendert.
    expect(out).toContain('<FadeInCurveSkew Value="0" />');
    expect(out).toContain('<FadeInCurveSlope Value="0" />');
    expect(out).toContain('<IsDefaultFadeIn Value="true" />');
    expect(out).toContain('<IsDefaultFadeOut Value="false" />');
    expect(out).toContain('<FadeOutLength Value="0.0101333562271062275" />');
  });

  it("schreibt das down-Tupel woertlich", () => {
    const out = patchFadeOutCurve(clipBlock("4c-fadeout-base.als"), "down");

    expect(out).toContain('<FadeOutCurveSkew Value="1" />');
    expect(out).toContain('<FadeOutCurveSlope Value="0.8999999762" />');
  });

  it("wirft bei ungueltigem dir", () => {
    expect(() =>
      patchFadeOutCurve(clipBlock("4c-fadeout-base.als"), "sideways"),
    ).toThrow(/up\|down/);
  });

  it("wirft wenn kein FadeOut gesetzt (IsDefaultFadeOut=true)", () => {
    const stub =
      '<AudioClip><Fades><FadeOutLength Value="0" />' +
      '<FadeOutCurveSkew Value="0" /><FadeOutCurveSlope Value="0" />' +
      '<IsDefaultFadeOut Value="true" /></Fades></AudioClip>';

    expect(() => patchFadeOutCurve(stub, "up")).toThrow(/FadeOut/);
  });

  it("wirft wenn kein <Fades>-Block", () => {
    expect(() => patchFadeOutCurve("<AudioClip></AudioClip>", "up")).toThrow(
      /Fades/,
    );
  });
});

// Hinweis: Die After-Fixtures sind WITNESS-only (Skew-Literal-Cross-Check),
// KEIN reiner Kurven-Byte-Delta von base — ihr FadeOutLength divergiert
// (User-gezogen). Niemals ein `patch(base) === after`-Diff hieraus ableiten;
// Diff-Isolation wird oben gegen `patch(base)` vs `base` geprueft.
describe("getFadeOutCurve", () => {
  it("liest Witness aus echten After-Fixtures (Cross-Check)", () => {
    expect(getFadeOutCurve(clipBlock("4c-fadeout-after-up.als"))).toBe("up");
    expect(getFadeOutCurve(clipBlock("4c-fadeout-after-down.als"))).toBe(
      "down",
    );
    expect(getFadeOutCurve(clipBlock("4c-fadeout-base.als"))).toBe("none");
  });

  it("Roundtrip patch->get", () => {
    const out = patchFadeOutCurve(clipBlock("4c-fadeout-base.als"), "down");

    expect(getFadeOutCurve(out)).toBe("down");
  });

  it("none ohne <Fades> (fb null) und ohne Skew-Tag (m null)", () => {
    expect(getFadeOutCurve("<AudioClip></AudioClip>")).toBe("none");
    expect(
      getFadeOutCurve(
        '<AudioClip><Fades><FadeOutLength Value="1" /></Fades></AudioClip>',
      ),
    ).toBe("none");
  });
});

describe("patchFadeOutCurve Tag-fehlt-Zweig", () => {
  it("wirft wenn FadeOutCurveSkew-Tag im <Fades> fehlt", () => {
    const stub =
      '<AudioClip><Fades><IsDefaultFadeOut Value="false" />' +
      '<FadeOutCurveSlope Value="0" /></Fades></AudioClip>';

    expect(() => patchFadeOutCurve(stub, "up")).toThrow(
      /FadeOutCurveSkew.*nicht gefunden/,
    );
  });
});
