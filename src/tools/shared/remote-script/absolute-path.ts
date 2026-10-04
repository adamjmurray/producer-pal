// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** A POSIX root, a Windows drive, or a Windows network share (`\\server`). */
const ABSOLUTE_PATH = /^(?:\/|[a-z]:[\\/]|\\\\)/i;

/**
 * Whether a path looks absolute, on any platform. A text check only: it never
 * touches the filesystem, so it works the same in V8 and Node.
 * @param path - The path to check
 * @returns True for `/…`, `C:\…` or `C:/…`, and `\\server\share\…`
 */
export function isAbsolutePath(path: string): boolean {
  return ABSOLUTE_PATH.test(path);
}
