// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The Audio Units installed on this machine, read from their bundles'
 * Info.plist files. Live's plug-in database has no AU rows (Live asks macOS),
 * and Live's browser says nothing about an AU's type, so this is where the type
 * comes from. Read-only.
 */

import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type PlistValue, parseXmlPlist } from "./parse-xml-plist.ts";

/** One Audio Unit inside a bundle (a bundle can hold several). */
export interface AuComponent {
  /** The AU's name without its vendor: "Serum 2 FX" */
  name: string;
  /** The vendor in the plist's name ("Xfer Records: Serum 2 FX"), if any */
  vendor: string | null;
  /** Apple's four-letter type: aumu (instrument), aufx or aumf (effect) */
  type: string;
  /** The `.component` bundle's path */
  bundle: string;
}

/**
 * @returns The folders macOS keeps Audio Unit bundles in
 */
export function auComponentDirs(): string[] {
  return [
    "/Library/Audio/Plug-Ins/Components",
    join(homedir(), "Library/Audio/Plug-Ins/Components"),
    "/System/Library/Components",
  ];
}

/**
 * Read the Audio Units in some folders. A folder that can't be read, a bundle
 * without a readable Info.plist (binary ones included) and an entry without a
 * name or type are left out.
 *
 * @param dirs - Folders holding `.component` bundles
 * @returns Every Audio Unit found
 */
export async function readAuComponents(
  dirs: string[] = auComponentDirs(),
): Promise<AuComponent[]> {
  const perDir = await Promise.all(
    dirs.map(async (dir) => {
      const entries = await readdir(dir).catch(() => []);

      return entries
        .filter((entry) => entry.toLowerCase().endsWith(".component"))
        .map((entry) => join(dir, entry));
    }),
  );
  const found = await Promise.all(perDir.flat().map(readBundle));

  return found.flat();
}

/**
 * @param bundle - Path of a `.component` bundle
 * @returns The Audio Units its Info.plist lists
 */
async function readBundle(bundle: string): Promise<AuComponent[]> {
  const xml = await readFile(
    join(bundle, "Contents", "Info.plist"),
    "utf8",
  ).catch(() => "");
  const root = parseXmlPlist(xml);
  const entries = isDict(root) ? root.AudioComponents : null;

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.flatMap((entry) => {
    const dict: Record<string, PlistValue> = isDict(entry) ? entry : {};
    const { name, type } = dict;

    if (typeof name !== "string" || typeof type !== "string") {
      return [];
    }

    // "Vendor: Name"; a name can hold ": " itself, so split at the first one.
    const split = name.indexOf(": ");

    return [
      {
        name: split < 0 ? name : name.slice(split + 2),
        vendor: split < 0 ? null : name.slice(0, split),
        type,
        bundle,
      },
    ];
  });
}

/**
 * @param value - A parsed plist value
 * @returns Whether it is a dict
 */
function isDict(
  value: PlistValue | null | undefined,
): value is { [key: string]: PlistValue } {
  return typeof value === "object" && value != null && !Array.isArray(value);
}
