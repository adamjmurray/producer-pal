// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Max writes a file path as `Volume:/folder/file`, not as the OS does.
const MAX_VOLUME_PATH = /^([^:/\\][^:]*):(\/.*)$/;
const WINDOWS_DRIVE_PATH = /^[A-Za-z]:[/\\]/;

/**
 * Turn a path in Max's form into one the OS can open.
 *
 * - `Macintosh HD:/Users/me/x.amxd` on the boot volume becomes
 *   `/Users/me/x.amxd`: the volume name is dropped when the rest exists.
 * - On any other volume it becomes `/Volumes/<Volume>/…`.
 * - A POSIX path or a Windows drive path (`C:/Users/…`) is returned as is.
 *
 * Known gap: an external volume whose path also exists on the boot volume
 * (the same `/Users/me/…`) reads as the boot volume.
 *
 * @param maxPath - A path from a patcher's `filepath`
 * @param exists - Whether a POSIX path exists on this machine
 * @returns The OS path, or null when it isn't an absolute file path
 */
export function maxPathToPosix(
  maxPath: string,
  exists: (path: string) => boolean,
): string | null {
  const path = maxPath.trim();

  if (path.startsWith("/") || WINDOWS_DRIVE_PATH.test(path)) {
    return path;
  }

  const match = MAX_VOLUME_PATH.exec(path);

  if (match == null) {
    return null;
  }

  const [, volume = "", rest = ""] = match;

  return exists(rest) ? rest : `/Volumes/${volume}${rest}`;
}
