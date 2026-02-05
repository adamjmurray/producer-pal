// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Parse an ID or path value to a path string for LiveAPI constructor
 * @param idOrPath - ID number/string, path string, or ["id", "123"] array
 * @returns Path string for LiveAPI constructor
 * @throws Error if array format is invalid
 */
export function parseIdOrPath(
  idOrPath: string | number | readonly (string | number)[],
): string {
  // Handle array format ["id", "123"] from Live API calls
  if (Array.isArray(idOrPath)) {
    if (idOrPath.length === 2 && idOrPath[0] === "id") {
      return `id ${String(idOrPath[1])}`;
    }

    throw new Error(
      `Invalid array format for LiveAPI.from(): expected ["id", value], got [${String(idOrPath)}]`,
    );
  }

  if (typeof idOrPath === "number") {
    return `id ${idOrPath}`;
  }

  // At this point, idOrPath must be a string
  const pathString = idOrPath as string;

  if (/^\d+$/.test(pathString)) {
    return `id ${pathString}`;
  }

  return pathString;
}
