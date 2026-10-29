// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Turn a plug-in name as Live's browser shows it ("Serum 2 FX") into the VST3
 * bundle that holds it, from Live's plug-in database. Only VST3 can be hosted
 * for now. Read-only.
 */

import { errorMessage } from "#src/shared/error-message.ts";
import { type ResolvedPlugin } from "../../library-types.ts";
import {
  deriveCategory,
  deriveFormat,
  selectPluginDb,
} from "../../list-plugins.ts";
import { openLiveDb } from "../../live-db.ts";

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
 * Find the installed VST3 plug-in with this name.
 *
 * @param args - The request
 * @param args.name - Plug-in name; case does not matter
 * @returns The plug-in's name, vendor, category and bundle path
 * @throws When the database can't be read, or no single VST3 plug-in matches
 */
export async function resolvePlugin({
  name,
}: ResolvePluginArgs): Promise<ResolvedPlugin> {
  const wanted = name?.trim() ?? "";

  if (wanted === "") {
    throw new Error("A plug-in name is required");
  }

  return pickPlugin(await readPluginRows(), wanted);
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
 * Choose the one VST3 plug-in named `wanted`, or explain why there isn't one.
 *
 * @param rows - Every enabled plug-in
 * @param wanted - The name asked for
 * @returns The match
 */
function pickPlugin(rows: PluginModuleRow[], wanted: string): ResolvedPlugin {
  const lower = wanted.toLowerCase();
  const named = rows.filter((row) => row.name.toLowerCase() === lower);
  const vst3 = named.filter(
    (row) => deriveFormat(row.dev_identifier) === "VST3" && row.path != null,
  );
  const [match] = vst3;

  if (match?.path != null && vst3.length === 1) {
    const category = deriveCategory(match.dev_identifier);

    if (category == null) {
      throw new Error(
        `Can't tell whether "${match.name}" is an instrument or an audio effect`,
      );
    }

    return {
      name: match.name,
      vendor: match.vendor,
      category,
      file: match.path,
      shared: rows.some((row) => row !== match && row.path === match.path),
    };
  }

  if (vst3.length > 1) {
    const vendors = [...new Set(vst3.map((row) => row.vendor ?? "unknown"))];

    throw new Error(
      `More than one VST3 plug-in is named "${wanted}" (vendors: ${vendors.join(", ")})`,
    );
  }

  if (named.length > 0) {
    const formats = [
      ...new Set(named.map((row) => deriveFormat(row.dev_identifier) ?? "?")),
    ];

    throw new Error(
      `"${wanted}" is installed as ${formats.join("/")}, not VST3. Only VST3 plug-ins can be hosted for now`,
    );
  }

  throw new Error(notFoundMessage(rows, wanted));
}

/**
 * Say the plug-in wasn't found, with similar VST3 names when there are any.
 *
 * @param rows - Every enabled plug-in
 * @param wanted - The name asked for
 * @returns The error message
 */
function notFoundMessage(rows: PluginModuleRow[], wanted: string): string {
  const lower = wanted.toLowerCase();
  const similar = [
    ...new Set(
      rows
        .filter(
          (row) =>
            deriveFormat(row.dev_identifier) === "VST3" &&
            row.name.toLowerCase().includes(lower),
        )
        .map((row) => row.name),
    ),
  ].slice(0, MAX_SUGGESTIONS);

  return similar.length > 0
    ? `No plug-in named "${wanted}". Similar VST3 plug-ins: ${similar.join(", ")}`
    : `No plug-in named "${wanted}"`;
}
