// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Schema-Eintrag eines patchbaren AudioClip-Flags. */
interface FlagDef {
  tag: string;
  type: "bool" | "int";
  def: string;
}

/**
 * Byte-belegte AudioClip-Flags (Recon-Gate G7). Jeder Tag erscheint genau 1×
 * pro AudioClip-Block; `def` ist der aus der Recon abgeleitete Default-Wert.
 */
export const CLIP_FLAG_SPEC: Record<string, FlagDef> = {
  Ram: { tag: "Ram", type: "bool", def: "false" },
  HiQ: { tag: "HiQ", type: "bool", def: "true" },
  IsWarped: { tag: "IsWarped", type: "bool", def: "true" },
  WarpMode: { tag: "WarpMode", type: "int", def: "0" },
};

/**
 * Patcht genau das eine Vorkommen eines AudioClip-Flag-Tags im übergebenen
 * Clip-Block byte-treu (bounded single replace).
 *
 * @param clipBlock - Roher AudioClip-Block-String aus dem `.als`-XML.
 * @param flag - Schlüssel aus CLIP_FLAG_SPEC (z. B. "HiQ").
 * @param value - Neuer Roh-Wert (bool: true|false, int: ganzzahlig).
 * @returns Der Clip-Block mit ersetztem Flag-Tag.
 * @throws {Error} Bei unbekanntem Flag, ungültigem Wert oder fehlendem Tag.
 */
export function patchClipFlag(
  clipBlock: string,
  flag: string,
  value: string,
): string {
  const def = CLIP_FLAG_SPEC[flag];

  if (def == null) {
    throw new Error(
      'Unbekannter Flag "' +
        flag +
        '". Gültig: ' +
        Object.keys(CLIP_FLAG_SPEC).join(", "),
    );
  }

  if (def.type === "bool" && value !== "true" && value !== "false") {
    throw new Error("Flag " + flag + " (bool) erwartet true|false");
  }

  if (def.type === "int" && !/^-?\d+$/.test(value)) {
    throw new Error("Flag " + flag + " (int) erwartet Integer/ganzzahlig");
  }

  const re = new RegExp("<" + def.tag + ' Value="[^"]*" />');

  if (!re.test(clipBlock)) {
    throw new Error(
      "Tag <" + def.tag + "> nicht im Clip-Block (AudioClip-only)",
    );
  }

  return clipBlock.replace(re, "<" + def.tag + ' Value="' + value + '" />');
}

/**
 * Liest die aktuellen Roh-Werte aller bekannten AudioClip-Flags aus dem Block.
 *
 * @param clipBlock - Roher AudioClip-Block-String aus dem `.als`-XML.
 * @returns Map Flag-Schlüssel → Roh-Wert; fehlende Tags werden weggelassen.
 */
export function getClipFlags(clipBlock: string): Record<string, string> {
  const flags: Record<string, string> = {};

  for (const [key, def] of Object.entries(CLIP_FLAG_SPEC)) {
    const m = clipBlock.match(
      new RegExp("<" + def.tag + ' Value="([^"]*)" />'),
    );

    if (m?.[1] != null) {
      flags[key] = m[1];
    }
  }

  return flags;
}
