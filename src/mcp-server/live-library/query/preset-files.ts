// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Find preset files (.adv, .adg) by name in Live's browser DB. For presets
 * Live's device browser doesn't list, like a pack's drum kits.
 *
 * Read-only: SELECT statements only.
 */

import { type DatabaseSync } from "node:sqlite";
import { deviceTypeForKind, fourCCsForKind } from "../library-filters.ts";
import { type LibraryDeviceKind } from "../library-types.ts";
import {
  nameFromPathSegment,
  resolveAbsolutePaths,
} from "../reconstruct-path.ts";
import { withLiveDb } from "./live-db-query.ts";
import { IN_A_PLACE, IN_LIBRARY_VIEWS } from "./candidate-query.ts";

export interface PresetFile {
  /** The file name, with its suffix */
  name: string;
  /** Absolute path, with forward slashes */
  path: string;
}

export interface PresetFileQuery {
  /** The preset name, lowercase, with no suffix, in path form */
  name: string;
  /** Only presets for this device */
  device?: { name: string; kind: LibraryDeviceKind };
}

/** Racks have no folder of their own to learn their class from. */
const RACK_CLASSES = new Map([
  ["drum rack", "device:ableton:instr:DrumGroupDevice"],
  ["instrument rack", "device:ableton:instr:InstrumentGroupDevice"],
  ["audio effect rack", "device:ableton:audiofx:AudioEffectGroupDevice"],
  ["midi effect rack", "device:ableton:midifx:MidiEffectGroupDevice"],
]);

const PRESET_TYPES = [
  ...fourCCsForKind("preset"),
  ...fourCCsForKind("device-group"),
];

/**
 * Presets with exactly this name (any case, with or without the suffix) among
 * the files Live lists in its browser.
 *
 * @param query - The name, and the device the presets must be for
 * @returns The files, or null when Live's database is missing or can't be read
 */
export async function findPresetFiles(
  query: PresetFileQuery,
): Promise<PresetFile[] | null> {
  return await withLiveDb<PresetFile[] | null>({
    onMissing: () => null,
    onError: () => null,
    run: (db) => presetFilesIn(db, query),
  });
}

// --- Helpers below main export ---

/**
 * @param db - Open database handle
 * @param query - The name, and the device
 * @returns The matching files with their paths
 */
function presetFilesIn(db: DatabaseSync, query: PresetFileQuery): PresetFile[] {
  const where = [
    `f.file_type IN (${PRESET_TYPES.map(() => "?").join(",")})`,
    // NOCASE folds ASCII only: a non-ASCII letter matches in the case given.
    "f.name COLLATE NOCASE IN (?, ?, ?)",
    IN_A_PLACE,
    IN_LIBRARY_VIEWS,
  ];
  const stored = nameFromPathSegment(query.name);
  const params: Array<string | number> = [
    ...PRESET_TYPES,
    stored,
    `${stored}.adv`,
    `${stored}.adg`,
  ];

  if (query.device != null) {
    const deviceClass = classOf(db, query.device);

    // Without the device's class there's no telling which presets are its.
    if (deviceClass == null) {
      return [];
    }

    where.push("f.device_id = ?");
    params.push(deviceClass);
  }

  const rows = db
    .prepare(
      `SELECT f.file_id, f.name FROM files f WHERE ${where.join(" AND ")}`,
    )
    .all(...params) as unknown as Array<{ file_id: number; name: string }>;
  const paths = resolveAbsolutePaths(
    db,
    rows.map((row) => row.file_id),
  );

  const files = rows.flatMap(({ file_id, name }) => {
    const resolved = paths.get(file_id);

    return resolved == null || resolved.truncated
      ? []
      : [{ name, path: resolved.path }];
  });

  // The same file can be listed twice; the caller must see it once.
  return [...new Map(files.map((file) => [file.path, file])).values()].toSorted(
    (a, b) => a.path.localeCompare(b.path),
  );
}

/**
 * Live's class for a device, which presets record as their `device_id`. A
 * device's own presets sit in a folder named after it, directly or one level
 * down (Core Library files them under categories), so take the class most of
 * those share. Racks built around the device don't count.
 *
 * Still a guess: an unrelated folder with the device's name, with presets for
 * another device in it, could outvote the real ones.
 *
 * @param db - Open database handle
 * @param device - The device's name, and its kind
 * @param device.name - The device as the browser names it
 * @param device.kind - Instrument, audio effect or MIDI effect
 * @returns The class, or null when no such folder holds presets for such a device
 */
function classOf(
  db: DatabaseSync,
  { name, kind }: { name: string; kind: LibraryDeviceKind },
): string | null {
  const rack = RACK_CLASSES.get(name.trim().toLowerCase());

  if (rack != null) {
    return rack;
  }

  const folders = fourCCsForKind("folder");
  const named = `SELECT file_id FROM files
    WHERE name = ? COLLATE NOCASE
      AND file_type IN (${folders.map(() => "?").join(",")})`;
  const row = db
    .prepare(
      `SELECT device_id FROM files
       WHERE file_type IN (${PRESET_TYPES.map(() => "?").join(",")})
         AND device_type = ?
         AND device_id NOT LIKE '%GroupDevice'
         AND (parent_id IN (${named})
           OR parent_id IN (SELECT file_id FROM files WHERE parent_id IN (${named})))
       GROUP BY device_id ORDER BY COUNT(*) DESC LIMIT 1`,
    )
    .get(
      ...PRESET_TYPES,
      deviceTypeForKind(kind),
      name.trim(),
      ...folders,
      name.trim(),
      ...folders,
    ) as { device_id: string } | undefined;

  return row?.device_id ?? null;
}
