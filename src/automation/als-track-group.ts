// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Schema-Eintrag eines patchbaren Track-Skalarfelds. */
interface TrackFieldDef {
  tag: string;
  type: "int" | "bool";
}

/**
 * Patchbare Track-Skalarfelder fuer Slice-8-Gruppen-Zuweisung/Fold.
 * `TrackGroupId` = Zugehoerigkeit zu einer existierenden Gruppe (`-1` =
 * ungrouped), `TrackUnfolded` = Gruppen-Fold-Zustand.
 */
export const TRACK_GROUP_SPEC: Record<string, TrackFieldDef> = {
  TrackGroupId: { tag: "TrackGroupId", type: "int" },
  TrackUnfolded: { tag: "TrackUnfolded", type: "bool" },
};

/**
 * Ein Skalarfeld in einem Track-Block genau 1× byte-treu ersetzen.
 * @param trackBlock - Der dekomprimierte Track-Block-Substring.
 * @param field - Feldname (Key in TRACK_GROUP_SPEC).
 * @param value - Neuer Wert (int-String bzw. true|false).
 * @returns Der Track-Block mit ersetztem Feld.
 */
export function patchTrackField(
  trackBlock: string,
  field: string,
  value: string,
): string {
  const def = TRACK_GROUP_SPEC[field];

  if (def == null) {
    throw new Error(
      `Unbekanntes Feld "${field}". Gültig: ${Object.keys(
        TRACK_GROUP_SPEC,
      ).join(", ")}`,
    );
  }

  if (def.type === "int" && !/^-?\d+$/.test(value)) {
    throw new Error(`Feld ${field} (int) erwartet Integer/ganzzahlig`);
  }

  if (def.type === "bool" && value !== "true" && value !== "false") {
    throw new Error(`Feld ${field} (bool) erwartet true|false`);
  }

  const re = new RegExp("<" + def.tag + ' Value="[^"]*" />');

  if (!re.test(trackBlock)) {
    throw new Error(`Tag <${def.tag}> nicht im Track-Block`);
  }

  return trackBlock.replace(re, "<" + def.tag + ' Value="' + value + '" />');
}

/**
 * Sicherstellen, dass eine Zielgruppe existiert (Slice-8-Scope:
 * Zuweisung NUR zu vorhandenen Gruppen; `-1` = entgruppieren ist
 * immer erlaubt). Neue Gruppe von Null ist Slice 8b/Engine.
 * @param xml - Dekomprimierter .als-XML-String.
 * @param groupId - Ziel-Gruppen-Id bzw. `-1` zum Entgruppieren.
 * @returns Nichts; wirft falls die Gruppe fehlt.
 */
export function assertGroupExists(xml: string, groupId: string): void {
  if (groupId === "-1") {
    return;
  }

  if (!new RegExp('<GroupTrack Id="' + groupId + '"').test(xml)) {
    throw new Error(
      `GroupTrack ${groupId} existiert nicht — neue Gruppe ist Slice 8b/Engine`,
    );
  }
}

/**
 * Den `<GroupTrack …>…</GroupTrack>`-Block per Anzeigenamen lokalisieren.
 *
 * `als-param-resolver.ts`/`locateTrackBlock` schliesst GroupTrack bewusst aus
 * (`TRACK_OPEN_RE` matcht nur Midi-/AudioTrack), daher dieser eigene Locator
 * fuer den `fold`-Pfad. Namensauflösung kanonisch wie `extractTrackName`:
 * `<UserName Value="…" />` bevorzugt, sonst `<EffectiveName Value="…" />`.
 * Liefert absolute Byte-Offsets fuer denselben Offset-Splice wie der
 * `set`-Pfad (`xml.slice(0,index)+block+xml.slice(end)`).
 * @param xml - Dekomprimierter .als-XML-String.
 * @param groupName - Anzeigename des Ziel-GroupTrack.
 * @returns Block-Substring sowie Start-Index und exklusiver End-Index.
 */
export function locateGroupTrackBlock(
  xml: string,
  groupName: string,
): { index: number; end: number; block: string } {
  const openRe = /<GroupTrack\b[^>]*>/g;
  const closeTag = "</GroupTrack>";
  let m: RegExpExecArray | null;

  while ((m = openRe.exec(xml)) != null) {
    const index = m.index;
    const closeAt = xml.indexOf(closeTag, index);

    if (closeAt < 0) {
      break;
    }

    const end = closeAt + closeTag.length;
    const block = xml.slice(index, end);

    if (groupTrackName(block) === groupName) {
      return { index, end, block };
    }
  }

  throw new Error(
    `GroupTrack "${groupName}" nicht gefunden (UserName bzw. EffectiveName)`,
  );
}

/**
 * Anzeigenamen eines GroupTrack-Blocks kanonisch extrahieren: `UserName`
 * bevorzugt (falls non-empty), sonst `EffectiveName` (analog
 * `extractTrackName` in als-param-resolver.ts).
 * @param block - GroupTrack-Block-Substring.
 * @returns Anzeigename bzw. Leerstring falls keiner gefunden.
 */
function groupTrackName(block: string): string {
  const userName = /<UserName Value="([^"]*)"/.exec(block);

  if (userName?.[1] != null && userName[1] !== "") {
    return userName[1];
  }

  const effectiveName = /<EffectiveName Value="([^"]*)"/.exec(block);

  return effectiveName?.[1] ?? "";
}
