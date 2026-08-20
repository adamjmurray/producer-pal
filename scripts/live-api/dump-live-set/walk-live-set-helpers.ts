// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ChildInfo, type TypeInfo } from "./dump-types.ts";

/** The line kinds an `info` listing uses. Anything else is a description line. */
const INFO_KINDS = new Set(["property", "child", "children", "function"]);

// Two or more segments, so a lone "/" or a name that happens to start with a
// slash is left alone. Live hands back absolute paths for samples and for the
// Set itself, which name the machine they were dumped on.
const ABSOLUTE_PATH = /^(?:\/[^/\n]+){2,}\/?$|^[A-Za-z]:[\\/]/;

const REDACTED = "<redacted absolute path>";

/** One child object found on a parent, with the path a tool would build for it. */
export interface ChildRef {
  path: string;
  id: string;
}

/**
 * Parse an `info` listing into the children, properties and functions it names.
 *
 * Only the four known line kinds are kept: an object's description is prose
 * that can wrap, and a wrapped line otherwise parses as a property that does
 * not exist.
 *
 * @param info - Raw `info` string from the Live API
 * @returns What the class exposes
 */
export function parseTypeInfo(info: string): TypeInfo {
  const type: TypeInfo = { children: {}, properties: {}, functions: [] };

  for (const line of info.split("\n")) {
    const [kind, name, lomType] = line.trim().split(/\s+/);

    if (!kind || !name || !INFO_KINDS.has(kind)) continue;

    if (kind === "function") {
      type.functions.push(name);
    } else if (kind === "property") {
      type.properties[name] = lomType ?? "";
    } else {
      type.children[name] = { type: lomType ?? "", list: kind === "children" };
    }
  }

  return type;
}

/**
 * Work out the child paths a `get()` on a child property implies.
 *
 * A list child answers with one `id N` pair per entry, and the path a tool
 * builds for entry i is `<parent> <name> <i>`. A single child answers with one
 * pair and lives at `<parent> <name>`.
 *
 * @param parentPath - Path of the object the property was read from
 * @param name - The child property name
 * @param child - Whether that name is a list, from the type's info
 * @param value - The raw `get()` result
 * @returns One ref per child that exists
 */
export function childRefs(
  parentPath: string,
  name: string,
  child: ChildInfo,
  value: unknown,
): ChildRef[] {
  if (!Array.isArray(value)) return [];

  const refs: ChildRef[] = [];

  for (let at = 0; at + 1 < value.length; at += 2) {
    if (value[at] !== "id") continue;

    const id = String(value[at + 1]);
    const index = refs.length;

    // An empty clip slot answers "id 0", and so does any child Live has not
    // made yet. Following one walks to nothing.
    if (id === "0") continue;

    refs.push({
      path: child.list
        ? `${parentPath} ${name} ${String(index)}`
        : `${parentPath} ${name}`,
      id,
    });
  }

  return refs;
}

/** One distinct `info` listing, and where it was first seen. */
export interface ListingEntry {
  className: string;
  examplePath: string;
  listing: TypeInfo;
}

/**
 * Name each distinct listing, using the class name where it is unambiguous.
 *
 * Live reports one class name for several LOM classes — "View" covers Song.View,
 * Track.View and Device.View — and even one class answers differently object by
 * object: a Drum Rack and an Instrument Rack are both "RackDevice", and only the
 * Drum Rack lists `drum_pads`. So a class with more than one listing gets each
 * labelled by a path where that listing was actually seen.
 *
 * @param listings - Distinct listings, keyed however the walk collected them
 * @returns The final `types` map, and where each collected key ended up
 */
export function collapseTypeKeys(listings: Map<string, ListingEntry>): {
  types: Record<string, TypeInfo>;
  finalKey: Map<string, string>;
} {
  const perClass = new Map<string, number>();

  for (const { className } of listings.values()) {
    perClass.set(className, (perClass.get(className) ?? 0) + 1);
  }

  const types: Record<string, TypeInfo> = {};
  const finalKey = new Map<string, string>();

  for (const [key, entry] of listings) {
    const label =
      perClass.get(entry.className) === 1
        ? entry.className
        : `${entry.className} @ ${entry.examplePath}`;

    types[label] = entry.listing;
    finalKey.set(key, label);
  }

  return { types, finalKey };
}

/**
 * Replace absolute filesystem paths in a property record, in place.
 * @param properties - Raw `get()` results by property name
 * @returns How many values were replaced
 */
export function redactFilePaths(properties: Record<string, unknown>): number {
  let redacted = 0;

  for (const [name, value] of Object.entries(properties)) {
    if (!Array.isArray(value)) {
      if (!isAbsolutePath(value)) continue;

      properties[name] = REDACTED;
      redacted++;

      continue;
    }

    for (let at = 0; at < value.length; at++) {
      if (!isAbsolutePath(value[at])) continue;

      value[at] = REDACTED;
      redacted++;
    }
  }

  return redacted;
}

/**
 * Whether a value is a string naming an absolute filesystem path.
 * @param value - The value to test
 * @returns True when it should be redacted
 */
function isAbsolutePath(value: unknown): boolean {
  return typeof value === "string" && ABSOLUTE_PATH.test(value);
}
