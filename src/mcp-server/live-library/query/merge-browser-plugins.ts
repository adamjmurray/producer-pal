// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Combine the plug-ins in Live's plugin DB with the ones in its browser.
 *
 * The browser is the source of truth for what exists: Live's DB can lag behind
 * new installs, still lists plug-ins in formats Live has turned off (VST2), and
 * never holds AUv3. The DB adds what the browser doesn't say: version,
 * category and subcategories.
 */

import { type BrowserPlugin } from "../../rpc/remote-script/browser/browser-plugins.ts";
import { type PluginItem } from "../library-types.ts";

/**
 * Merge DB plug-ins into the browser's list.
 *
 * Each browser plug-in is matched to a DB row by format and name and keeps the
 * browser's name and vendor ("Valhalla DSP", not the DB's "Valhalla DSP, LLC").
 * DB rows with no browser match are dropped. A browser plug-in with no DB row
 * has no version, category or subcategories.
 *
 * @param dbPlugins - Plug-ins read from Live's plugin DB
 * @param browserPlugins - Plug-ins listed by Live's browser
 * @returns The merged plug-ins, sorted by name
 */
export function mergeBrowserPlugins(
  dbPlugins: PluginItem[],
  browserPlugins: BrowserPlugin[],
): PluginItem[] {
  const dbByKey = new Map<string, PluginItem[]>();

  for (const plugin of dbPlugins) {
    const key = joinKey(plugin.format, plugin.name);

    dbByKey.set(key, [...(dbByKey.get(key) ?? []), plugin]);
  }

  return browserPlugins
    .map((listed) => {
      const dbPlugin = pickDbPlugin(
        dbByKey.get(joinKey(listed.format, listed.name)) ?? [],
        listed.vendor,
      );

      return {
        name: listed.name,
        vendor: listed.vendor ?? dbPlugin?.vendor ?? null,
        version: dbPlugin?.version ?? null,
        format: listed.format,
        category: dbPlugin?.category ?? null,
        subcategories: dbPlugin?.subcategories ?? [],
      };
    })
    .toSorted((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    );
}

/**
 * Pick the DB row for a browser plug-in. Two plug-ins can share a format and
 * name, so the row's vendor must read like the browser's (either may be the
 * longer, as in "Valhalla DSP" and "Valhalla DSP, LLC"). No match gives no row:
 * a missing category beats a wrong one. A browser plug-in with no vendor folder
 * takes the first row.
 *
 * @param candidates - DB rows with the browser plug-in's format and name
 * @param vendor - The browser's vendor folder, if any
 * @returns The best row, or undefined when there is none
 */
function pickDbPlugin(
  candidates: PluginItem[],
  vendor: string | null,
): PluginItem | undefined {
  if (vendor == null) {
    return candidates[0];
  }

  const wanted = vendor.trim().toLowerCase();

  return candidates.find((candidate) => {
    const have = (candidate.vendor ?? "").trim().toLowerCase();

    return have !== "" && (have.startsWith(wanted) || wanted.startsWith(have));
  });
}

/**
 * The key a browser plug-in and a DB row share.
 *
 * @param format - The plug-in format
 * @param name - The plug-in name
 * @returns The join key
 */
function joinKey(format: PluginItem["format"], name: string): string {
  return `${format ?? ""}|${name.normalize("NFC").trim().toLowerCase()}`;
}
