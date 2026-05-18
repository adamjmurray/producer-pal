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
    trackBlock.slice(0, sub.start) + patchedBlock + trackBlock.slice(sub.end)
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

  const n = Number(m[1]);

  if (n !== 0 && n !== 1 && n !== 2) {
    throw new Error(
      `CrossFadeState-Manual "${m[1]}" ungueltig — erwartet 0|1|2`,
    );
  }

  return n;
}

const SENDSPRE_OPEN = "<SendsPre>";
const SENDSPRE_CLOSE = "</SendsPre>";

/**
 * Send-Pre/Post-Bool fuer einen Return-Track byte-treu setzen. `<SendsPre>`
 * ist EIN dokument-globaler Block im `<LiveSet>` mit je einem
 * `<SendPreBool Id="N" Value="bool" />` pro Return; adressiert byte-eindeutig
 * ueber `Id` (korreliert mit `<TrackSendHolder Id>`).
 * @param xml - Dekomprimierter .als-XML-String.
 * @param returnId - Return-Track-Id (siehe TrackSendHolder Id).
 * @param value - true = Pre-Fader, false = Post-Fader.
 * @returns Das XML mit ersetztem SendPreBool.
 */
export function patchSendPreBool(
  xml: string,
  returnId: number,
  value: boolean,
): string {
  const sub = extractSendsPreBlock(xml);
  const re = new RegExp(
    '<SendPreBool Id="' + returnId + '" Value="[^"]*" \\/>',
  );

  if (!re.test(sub.block)) {
    const ids = Object.keys(getSendPreBools(xml)).join(", ");

    throw new Error(
      `SendPreBool Id=${returnId} nicht gefunden — vorhanden: ${ids}`,
    );
  }

  const patchedBlock = sub.block.replace(
    re,
    '<SendPreBool Id="' + returnId + '" Value="' + value + '" />',
  );

  return xml.slice(0, sub.start) + patchedBlock + xml.slice(sub.end);
}

/**
 * Alle Send-Pre/Post-Bools des Sets lesen (Id → bool).
 * @param xml - Dekomprimierter .als-XML-String.
 * @returns Map Return-Id → Pre-Fader-bool.
 */
export function getSendPreBools(xml: string): Record<number, boolean> {
  const sub = extractSendsPreBlock(xml);
  const out: Record<number, boolean> = {};
  const re = /<SendPreBool Id="(\d+)" Value="(true|false)" \/>/g;

  for (const m of sub.block.matchAll(re)) {
    // Beide Capture-Gruppen sind durch das Regex bei jedem Match garantiert;
    // noUncheckedIndexedAccess macht den Typ optional, der Wert nicht.
    out[Number(m[1])] = m[2] === "true";
  }

  return out;
}

/**
 * Den globalen `<SendsPre>…</SendsPre>`-Block mit Offsets extrahieren.
 * @param xml - Dekomprimierter .als-XML-String.
 * @returns Block-Substring plus absolute start/end-Offsets.
 */
function extractSendsPreBlock(xml: string): {
  block: string;
  start: number;
  end: number;
} {
  const start = xml.indexOf(SENDSPRE_OPEN);
  const closeAt = start < 0 ? -1 : xml.indexOf(SENDSPRE_CLOSE, start);

  if (start < 0 || closeAt < 0) {
    throw new Error("Kein <SendsPre>-Block im Set");
  }

  const end = closeAt + SENDSPRE_CLOSE.length;

  return { block: xml.slice(start, end), start, end };
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
  const closeAt = start < 0 ? -1 : trackBlock.indexOf(CROSSFADE_CLOSE, start);

  if (start < 0 || closeAt < 0) {
    throw new Error("Kein <CrossFadeState>-Block im Track");
  }

  const end = closeAt + CROSSFADE_CLOSE.length;

  return { block: trackBlock.slice(start, end), start, end };
}
