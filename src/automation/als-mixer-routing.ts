// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

const CROSSFADE_OPEN = "<CrossFadeState>";
const CROSSFADE_CLOSE = "</CrossFadeState>";

/**
 * Crossfader-Zuweisung in einem Track-Block byte-treu setzen. Wert ist das
 * erste `<Manual Value="N" />` INNERHALB des `<CrossFadeState>`-Blocks
 * (0=A, 1=Center, 2=B). Ankert erst den Sub-Block, um Kollision mit dem
 * `<Manual>` von Volume/Pan zu vermeiden.
 * @param trackBlock - Dekomprimierter Track-Block-Substring.
 * @param value - 0 (A), 1 (Center) oder 2 (B).
 * @returns Der Track-Block mit ersetztem CrossFadeState-Manual.
 */
export function patchCrossFadeAssign(
  trackBlock: string,
  value: number,
): string {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new Error(
      `Crossfader-Wert ${value} ungueltig — erlaubt 0|1|2 (A|center|B)`,
    );
  }

  const sub = extractCrossFadeBlock(trackBlock);
  const manualRe = /<Manual Value="[^"]*" \/>/;

  if (!manualRe.test(sub.block)) {
    throw new Error("Kein <Manual> im <CrossFadeState>-Block");
  }

  const patchedBlock = sub.block.replace(
    manualRe,
    '<Manual Value="' + value + '" />',
  );

  return (
    trackBlock.slice(0, sub.start) +
    patchedBlock +
    trackBlock.slice(sub.end)
  );
}

/**
 * Aktuelle Crossfader-Zuweisung aus einem Track-Block lesen.
 * @param trackBlock - Dekomprimierter Track-Block-Substring.
 * @returns 0 (A), 1 (Center) oder 2 (B).
 */
export function getCrossFadeAssign(trackBlock: string): number {
  const sub = extractCrossFadeBlock(trackBlock);
  const m = /<Manual Value="([^"]*)" \/>/.exec(sub.block);

  if (m?.[1] == null) {
    throw new Error("Kein <Manual> im <CrossFadeState>-Block");
  }

  return Number(m[1]);
}

/**
 * Den `<CrossFadeState>…</CrossFadeState>`-Block mit Offsets extrahieren.
 * @param trackBlock - Track-Block-Substring.
 * @returns Block-Substring plus absolute start/end-Offsets im trackBlock.
 */
function extractCrossFadeBlock(trackBlock: string): {
  block: string;
  start: number;
  end: number;
} {
  const start = trackBlock.indexOf(CROSSFADE_OPEN);
  const closeAt =
    start < 0 ? -1 : trackBlock.indexOf(CROSSFADE_CLOSE, start);

  if (start < 0 || closeAt < 0) {
    throw new Error("Kein <CrossFadeState>-Block im Track");
  }

  const end = closeAt + CROSSFADE_CLOSE.length;

  return { block: trackBlock.slice(start, end), start, end };
}
