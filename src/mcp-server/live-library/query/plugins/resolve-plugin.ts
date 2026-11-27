// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Turn a plug-in name as Live's browser shows it ("Serum 2 FX") into what the
 * plug-in host loads. A name installed in several formats resolves in the order
 * VST3, AU, VST2; a browser path ("Plug-Ins/AU/Xfer Records/Serum 2 FX") loads
 * only the format it names. VST3 and VST2 come from Live's plug-in database;
 * AUs come from Live's browser, because the database has none. An AU still
 * resolves when the database can't be read. Read-only.
 */

import { errorMessage } from "#src/shared/error-message.ts";
import {
  type BrowserPlugin,
  listBrowserPlugins,
} from "../../../rpc/remote-script/browser/browser-plugins.ts";
import { type PluginFormat, type ResolvedPlugin } from "../../library-types.ts";
import {
  deriveCategory,
  deriveFormat,
  selectPluginDb,
} from "../../list-plugins.ts";
import { openLiveDb } from "../../live-db.ts";
import { pathSegment } from "../../reconstruct-path.ts";
import { pluginFolderFilter } from "./plugin-folder-filter.ts";
import { distinctPlugins } from "./distinct-plugins.ts";
import { parsePluginPath } from "./plugin-path.ts";
import { resolveAuPlugin } from "./resolve-au-plugin.ts";
import { samePluginName } from "./same-plugin-name.ts";
import { vendorMatches } from "./same-vendor.ts";
import { vst3PluginIds } from "./vst3-plugin-ids.ts";

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
 * @param args.name - Plug-in name, or `Plug-Ins/<format>/<vendor>/<name>` to
 *   pick a format; case does not matter
 * @param auDirs - Folders to read AU bundles from (the system's by default)
 * @param appDirs - Folders to read apps' AUv3 plug-ins from (the system's by default)
 * @returns The plug-in's name, vendor, category, format and bundle path
 * @throws When no single plug-in matches, or a VST can't be looked up because
 *   the database can't be read
 */
export async function resolvePlugin(
  { name }: ResolvePluginArgs,
  auDirs?: string[],
  appDirs?: string[],
): Promise<ResolvedPlugin> {
  const asked = name?.trim() ?? "";

  if (asked === "") {
    throw new Error("A plug-in name is required");
  }

  const { name: wanted, format, vendor } = parsePluginPath(asked);
  // A path must be one Live's browser lists, as a native load needs. With the
  // remote script unanswering nothing is checked: hosting fails on that next.
  const listed = format == null ? null : await listBrowserPlugins();

  const { rows, failure } = await readPluginRows();

  if (format != null && listed != null) {
    requireListedPath(listed, rows, { asked, wanted, format, vendor });
  }

  // A pinned format never falls through to another one.
  const allows = (candidate: PluginFormat): boolean =>
    format == null || format === candidate;
  const vst3 = allows("VST3")
    ? resolveDbPlugin(rows, wanted, "VST3", vendor)
    : null;

  if (vst3 != null) {
    return vst3;
  }

  // The browser is only asked once VST3 has missed, and the AU bundles only
  // when it lists an AU of that name. An unanswering remote script means no AUs.
  const browserPlugins = listed ?? (await listBrowserPlugins()) ?? [];
  const au = allows("AU")
    ? await resolveAuPlugin(
        withVendor(
          browserPlugins.filter(
            (item) => item.format === "AU" && samePluginName(item.name, wanted),
          ),
          vendor,
        ),
        wanted,
        auDirs,
        appDirs,
      )
    : null;
  const found =
    au ?? (allows("VST") ? resolveDbPlugin(rows, wanted, "VST", vendor) : null);

  if (found != null) {
    return found;
  }

  // Only VST2 and VST3 need the database, so only they fail without it.
  if (failure != null && format !== "AU") {
    throw new Error(failure);
  }

  throw new Error(notFoundMessage(rows, browserPlugins, wanted, format));
}

/**
 * Read every enabled plug-in with its bundle path.
 *
 * @returns One row per plug-in, or no rows and why the database can't be read
 *   (it is missing or doesn't have the expected tables)
 */
async function readPluginRows(): Promise<{
  rows: PluginModuleRow[];
  failure?: string;
}> {
  try {
    const source = await selectPluginDb();

    if (source == null) {
      throw new Error("Live plug-in database not found");
    }

    const db = await openLiveDb(source);

    try {
      // Live 11 and 12.0-12.1 keep these tables in the files database; if the
      // join doesn't fit there, the catch below reports it.
      const rows = db
        .prepare(
          `SELECT p.name, p.vendor, p.dev_identifier, m.path
           FROM plugins p JOIN plugin_modules m ON m.module_id = p.module_id
           WHERE p.enabled = 1 ${pluginFolderFilter(db, "p")}`,
        )
        .all() as unknown as PluginModuleRow[];

      return { rows };
    } finally {
      db.close();
    }
  } catch (error) {
    return {
      rows: [],
      failure: `Can't read Live's plug-in database: ${errorMessage(error)}`,
    };
  }
}

/**
 * Choose the one plug-in of a format named `wanted`, or say why there isn't one.
 *
 * @param rows - Every enabled plug-in
 * @param wanted - The name asked for
 * @param format - VST3 or VST (VST2)
 * @param vendor - The vendor folder the path named, to choose between plug-ins
 *   of one name
 * @returns The match, or null when none has this name in this format
 * @throws When several do, its kind is unknown, or it is a VST2 shell plug-in
 */
function resolveDbPlugin(
  rows: PluginModuleRow[],
  wanted: string,
  format: "VST3" | "VST",
  vendor?: string | null,
): ResolvedPlugin | null {
  const label = format === "VST" ? "VST2" : format;
  // A plug-in installed in two folders is one plug-in, not two of one name.
  const named = distinctPlugins(
    withVendor(
      rows.filter(
        (row) =>
          deriveFormat(row.dev_identifier) === format &&
          row.path != null &&
          samePluginName(row.name, wanted),
      ),
      vendor,
    ),
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

  const siblings = rows
    .filter(
      (row) =>
        row !== match &&
        row.path === match.path &&
        deriveFormat(row.dev_identifier) === "VST3",
    )
    .map((row) => row.name);

  return {
    name: match.name,
    vendor: match.vendor,
    category,
    format,
    file: match.path,
    shared,
    ...(format === "VST3" && siblings.length > 0 && { siblings }),
    ...(format === "VST3" &&
      shared && { ids: vst3PluginIds(match.dev_identifier) }),
  };
}

/**
 * Say the plug-in wasn't found. A VST that Live's browser lists but its
 * database doesn't (a new install) says to restart Live. Otherwise similar
 * names are offered when there are any.
 *
 * @param rows - Every enabled plug-in
 * @param browserPlugins - The plug-ins Live's browser lists
 * @param wanted - The name asked for
 * @param format - The format it was asked for in, when it named one
 * @returns The error message
 */
function notFoundMessage(
  rows: PluginModuleRow[],
  browserPlugins: BrowserPlugin[],
  wanted: string,
  format: PluginFormat | undefined,
): string {
  const inFormat = (candidate: PluginFormat | null): boolean =>
    format == null || candidate === format;
  const unscanned = browserPlugins.find(
    (item) =>
      (item.format === "VST3" || item.format === "VST") &&
      inFormat(item.format) &&
      samePluginName(item.name, wanted),
  );

  if (unscanned != null) {
    return `Live lists "${unscanned.name}" but its plug-in database doesn't have it yet. Restart Live, then try again.`;
  }

  const lower = wanted.toLowerCase();
  const names = [
    ...rows
      .filter((row) => {
        const rowFormat = deriveFormat(row.dev_identifier);

        return (
          (rowFormat === "VST3" || rowFormat === "VST") &&
          inFormat(rowFormat) &&
          row.path != null
        );
      })
      .map((row) => row.name),
    ...browserPlugins
      .filter((item) => item.format === "AU" && inFormat("AU"))
      .map((item) => item.name),
  ];
  const label = format == null ? "" : `${formatLabel(format)} `;
  const similar = [
    ...new Set(names.filter((item) => item.toLowerCase().includes(lower))),
  ].slice(0, MAX_SUGGESTIONS);

  return similar.length > 0
    ? `No ${label}plug-in named "${wanted}". Similar plug-ins: ${similar.join(", ")}`
    : `No ${label}plug-in named "${wanted}"`;
}

/**
 * Refuse a path Live's browser doesn't list.
 * @param listed - The plug-ins Live's browser lists
 * @param rows - Every enabled plug-in
 * @param path - The path asked for
 * @param path.asked - As the call spelled it
 * @param path.wanted - Its plug-in name
 * @param path.format - Its format
 * @param path.vendor - Its vendor folder, or null for none
 * @throws When nothing is listed there, naming where the plug-in is if it is
 *   listed under another vendor
 */
function requireListedPath(
  listed: BrowserPlugin[],
  rows: PluginModuleRow[],
  path: {
    asked: string;
    wanted: string;
    format: PluginFormat;
    vendor?: string | null;
  },
): void {
  const named = listed.filter(
    (item) =>
      item.format === path.format && samePluginName(item.name, path.wanted),
  );

  if (
    named.some((item) => samePluginName(item.vendor ?? "", path.vendor ?? ""))
  ) {
    return;
  }

  const [elsewhere] = named;

  if (elsewhere == null) {
    throw new Error(notFoundMessage(rows, listed, path.wanted, path.format));
  }

  const folders = [path.format, elsewhere.vendor, elsewhere.name]
    .filter((part) => part != null)
    .map(pathSegment);

  throw new Error(
    `No ${formatLabel(path.format)} plug-in at "${path.asked}"; Live lists it at "Plug-Ins/${folders.join("/")}"`,
  );
}

/**
 * Narrow same-name plug-ins to the vendor a path named: the exact vendor when
 * there is one, else the loosely matching ones. A vendor spelled too
 * differently to match anything narrows nothing, so a path that loads still
 * loads.
 * @param named - Plug-ins of one name and format
 * @param vendor - The vendor folder the path named, if it did
 * @returns The ones from that vendor, else all of them
 */
function withVendor<T extends { vendor: string | null }>(
  named: T[],
  vendor: string | null | undefined,
): T[] {
  const chosen =
    vendor == null ? [] : vendorMatches(named, vendor, (item) => item.vendor);

  return chosen.length > 0 ? chosen : named;
}

/**
 * @param format - A plug-in format
 * @returns What errors call it
 */
function formatLabel(format: PluginFormat): string {
  return format === "VST" ? "VST2" : format;
}
