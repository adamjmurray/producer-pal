// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Turn a plug-in name as Live's browser shows it ("Serum 2 FX") into what the
 * plug-in host loads. A name installed in several formats resolves in the order
 * VST3, AU, VST2. VST3 and VST2 come from Live's plug-in database; AUs come
 * from Live's browser, because the database has none. Read-only.
 */

import { errorMessage } from "#src/shared/error-message.ts";
import {
  type BrowserPlugin,
  listBrowserPlugins,
} from "../../../rpc/remote-script/browser/browser-plugins.ts";
import { type ResolvedPlugin } from "../../library-types.ts";
import {
  deriveCategory,
  deriveFormat,
  selectPluginDb,
} from "../../list-plugins.ts";
import { openLiveDb } from "../../live-db.ts";
import { resolveAuPlugin } from "./resolve-au-plugin.ts";
import { samePluginName } from "./same-plugin-name.ts";

export interface ResolvePluginArgs {
  name?: string;
}

interface PluginModuleRow {
  name: string;
  vendor: string | null;
  dev_identifier: string | null;
  path: string | null;
}

const MAX_SUGGESTIONS = 5;

/**
 * Find the installed plug-in with this name.
 *
 * @param args - The request
 * @param args.name - Plug-in name; case does not matter
 * @param auDirs - Folders to read AU bundles from (the system's by default)
 * @returns The plug-in's name, vendor, category, format and bundle path
 * @throws When the database can't be read, or no single plug-in matches
 */
export async function resolvePlugin(
  { name }: ResolvePluginArgs,
  auDirs?: string[],
): Promise<ResolvedPlugin> {
  const wanted = name?.trim() ?? "";

  if (wanted === "") {
    throw new Error("A plug-in name is required");
  }

  const rows = await readPluginRows();
  const vst3 = resolveDbPlugin(rows, wanted, "VST3");

  if (vst3 != null) {
    return vst3;
  }

  // The browser is only asked once VST3 has missed, and the AU bundles only
  // when it lists an AU of that name. An unanswering remote script means no AUs.
  const browserPlugins = (await listBrowserPlugins()) ?? [];
  const au = await resolveAuPlugin(
    browserPlugins.filter(
      (item) => item.format === "AU" && samePluginName(item.name, wanted),
    ),
    wanted,
    auDirs,
  );
  const found = au ?? resolveDbPlugin(rows, wanted, "VST");

  if (found == null) {
    throw new Error(notFoundMessage(rows, browserPlugins, wanted));
  }

  return found;
}

/**
 * Read every enabled plug-in with its bundle path.
 *
 * @returns One row per plug-in
 * @throws When the database is missing or doesn't have the expected tables
 */
async function readPluginRows(): Promise<PluginModuleRow[]> {
  try {
    const source = await selectPluginDb();

    if (source == null) {
      throw new Error("Live plug-in database not found");
    }

    const db = await openLiveDb(source);

    try {
      // Live 11 and 12.0-12.1 keep these tables in the files database; if the
      // join doesn't fit there, the catch below reports it.
      return db
        .prepare(
          `SELECT p.name, p.vendor, p.dev_identifier, m.path
           FROM plugins p JOIN plugin_modules m ON m.module_id = p.module_id
           WHERE p.enabled = 1`,
        )
        .all() as unknown as PluginModuleRow[];
    } finally {
      db.close();
    }
  } catch (error) {
    throw new Error(
      `Can't read Live's plug-in database: ${errorMessage(error)}`,
      { cause: error },
    );
  }
}

/**
 * Choose the one plug-in of a format named `wanted`, or say why there isn't one.
 *
 * @param rows - Every enabled plug-in
 * @param wanted - The name asked for
 * @param format - VST3 or VST (VST2)
 * @returns The match, or null when none has this name in this format
 * @throws When several do, its kind is unknown, or it is a VST2 shell plug-in
 */
function resolveDbPlugin(
  rows: PluginModuleRow[],
  wanted: string,
  format: "VST3" | "VST",
): ResolvedPlugin | null {
  const label = format === "VST" ? "VST2" : format;
  const named = rows.filter(
    (row) =>
      deriveFormat(row.dev_identifier) === format &&
      row.path != null &&
      samePluginName(row.name, wanted),
  );
  const [match] = named;

  if (match?.path == null) {
    return null;
  }

  if (named.length > 1) {
    const vendors = [...new Set(named.map((row) => row.vendor ?? "unknown"))];

    throw new Error(
      `More than one ${label} plug-in is named "${wanted}" (vendors: ${vendors.join(", ")})`,
    );
  }

  const category = deriveCategory(match.dev_identifier);

  if (category == null) {
    throw new Error(
      `Can't tell whether "${match.name}" is an instrument or an audio effect`,
    );
  }

  const shared = rows.some((row) => row !== match && row.path === match.path);

  if (shared && format === "VST") {
    throw new Error(
      `"${match.name}" is a VST2 shell plug-in (it shares its file with other plug-ins), and those can't be hosted yet`,
    );
  }

  return {
    name: match.name,
    vendor: match.vendor,
    category,
    format,
    file: match.path,
    shared,
  };
}

/**
 * Say the plug-in wasn't found, with similar names when there are any.
 *
 * @param rows - Every enabled plug-in
 * @param browserPlugins - The plug-ins Live's browser lists
 * @param wanted - The name asked for
 * @returns The error message
 */
function notFoundMessage(
  rows: PluginModuleRow[],
  browserPlugins: BrowserPlugin[],
  wanted: string,
): string {
  const lower = wanted.toLowerCase();
  const names = [
    ...rows
      .filter((row) => {
        const format = deriveFormat(row.dev_identifier);

        return (format === "VST3" || format === "VST") && row.path != null;
      })
      .map((row) => row.name),
    ...browserPlugins
      .filter((item) => item.format === "AU")
      .map((item) => item.name),
  ];
  const similar = [
    ...new Set(names.filter((item) => item.toLowerCase().includes(lower))),
  ].slice(0, MAX_SUGGESTIONS);

  return similar.length > 0
    ? `No plug-in named "${wanted}". Similar plug-ins: ${similar.join(", ")}`
    : `No plug-in named "${wanted}"`;
}
