// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Byte-belegte Slice-4c-FadeOut-Kurven-Tupel (Recon-B aus User-Fixtures,
 * woertlich, keine Float-Neuformatierung). Skew-Vorzeichen wie 4b-FadeIn,
 * Slope-Vorzeichen gespiegelt.
 */
const FADEOUT_CURVE_TUPLES: Record<string, { skew: string; slope: string }> = {
  up: { skew: "-1", slope: "-0.8999999762" },
  down: { skew: "1", slope: "0.8999999762" },
};

/**
 * Die FadeOut-Kurve eines AudioClip-Blocks byte-treu auf `up`|`down` setzen.
 * Schreibt `FadeOutCurveSkew` + `FadeOutCurveSlope` atomar im `<Fades>`-Scope.
 * `IsDefaultFadeOut` ist Vorbedingung (`false`, ein FadeOut muss existieren)
 * und wird NICHT geschrieben (anders als 4b-FadeIn).
 * @param clipXml - Der `<AudioClip>`-Block als String.
 * @param dir - `up` oder `down` (einzige byte-belegten Tupel).
 * @returns Der Clip-Block mit ersetzter FadeOut-Kurve.
 */
export function patchFadeOutCurve(clipXml: string, dir: string): string {
  const tuple = FADEOUT_CURVE_TUPLES[dir];

  if (tuple == null) {
    throw new Error(
      `FadeOut-Kurve erwartet up|down (byte-belegt), nicht "${dir}"`,
    );
  }

  const fb = fadesBlock(clipXml);

  if (/<IsDefaultFadeOut Value="true" \/>/.test(fb.block)) {
    throw new Error(
      "FadeOut-Laenge erforderlich (IsDefaultFadeOut=true) — kein FadeOut",
    );
  }

  const writes: Array<[string, string]> = [
    ["FadeOutCurveSkew", tuple.skew],
    ["FadeOutCurveSlope", tuple.slope],
  ];
  let block = fb.block;

  for (const [tag, v] of writes) {
    const re = new RegExp(`(<${tag} Value=")[^"]*(" />)`);

    if (!re.test(block)) {
      throw new Error(`Tag <${tag}> in <Fades> nicht gefunden`);
    }

    block = block.replace(re, `$1${v}$2`);
  }

  return clipXml.slice(0, fb.start) + block + clipXml.slice(fb.end);
}

/**
 * Den Witness der FadeOut-Kurve lesen: `FadeOutCurveSkew`-Literal `-1`→`up`,
 * `1`→`down`, sonst `none`.
 * @param clipXml - Der `<AudioClip>`-Block als String.
 * @returns `up` | `down` | `none`.
 */
export function getFadeOutCurve(clipXml: string): string {
  const fb = fadesBlockOrNull(clipXml);
  const m = (fb?.block ?? "").match(
    /<FadeOutCurveSkew Value="([^"]*)" \/>/,
  );
  const skew = m?.[1] ?? "0";

  return skew === "-1" ? "up" : skew === "1" ? "down" : "none";
}

/**
 * Den `<Fades>…</Fades>`-Block lokalisieren oder `null`.
 * @param clipXml - Clip-XML-Block.
 * @returns Block + Offsets oder `null`.
 */
function fadesBlockOrNull(
  clipXml: string,
): { block: string; start: number; end: number } | null {
  const m = clipXml.match(/<Fades>[^]*?<\/Fades>/);

  if (m?.index == null) {
    return null;
  }

  return { block: m[0], start: m.index, end: m.index + m[0].length };
}

/**
 * Wie `fadesBlockOrNull`, wirft aber bei fehlendem Block.
 * @param clipXml - Clip-XML-Block.
 * @returns Block + Offsets.
 */
function fadesBlock(clipXml: string): {
  block: string;
  start: number;
  end: number;
} {
  const fb = fadesBlockOrNull(clipXml);

  if (fb == null) {
    throw new Error("<Fades>-Block im Clip nicht gefunden");
  }

  return fb;
}
