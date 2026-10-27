// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { dirname, join } from "node:path";
import { REMOTE_SCRIPT_LEFTOVER } from "#src/mcp-server/rpc/remote-script/install/remote-script-install.ts";
import { listLibraryFolder } from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";

/**
 * Find the temp and backup folders a remote script install makes beside the
 * script. Only names our install code makes match, young or stale.
 *
 * @param scriptPath - The installed script's folder, there or not
 * @returns Absolute paths of the leftovers, sorted. None when the Remote Scripts folder can't be read.
 */
export function findRemoteScriptLeftovers(scriptPath: string): string[] {
  const folder = dirname(scriptPath);

  try {
    return listLibraryFolder(folder)
      .filter((name) => REMOTE_SCRIPT_LEFTOVER.test(name))
      .toSorted()
      .map((name) => join(folder, name));
  } catch {
    return [];
  }
}
