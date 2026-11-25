// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { stat } from "node:fs/promises";

/**
 * Whether a file the library lists is still on disk. Only a file that is
 * really gone counts as gone: any other stat error (no permission, an I/O
 * error, a slow or unplugged volume) says nothing about the file, so it stays.
 * @param path - The file's absolute path
 * @returns False when the file or a folder above it doesn't exist, else true
 */
export async function fileExistsOnDisk(path: string): Promise<boolean> {
  try {
    await stat(path);

    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;

    return code !== "ENOENT" && code !== "ENOTDIR";
  }
}
