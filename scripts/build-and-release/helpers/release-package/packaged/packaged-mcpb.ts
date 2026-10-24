// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// `npm run release:amxd` wipes release/, so a tag made right after it names a
// release whose .mcpb was never built. This ties the tag to `npm run release:mcpb`.

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

/** The file `npm run release:mcpb` leaves in release/. */
export const MCPB_FILENAME = "Producer_Pal.mcpb";

/**
 * Check that release/ holds an .mcpb packaged from the current build.
 *
 * @param releaseDir - The release/ folder
 * @returns Refusal lines (headline first), or null when the .mcpb is current
 */
export function checkMcpbPackaged(releaseDir: string): string[] | null {
  const mcpbPath = join(releaseDir, MCPB_FILENAME);

  if (!existsSync(mcpbPath)) {
    return [
      `release/${MCPB_FILENAME} not found.`,
      "The release was never packaged, so the tag would name a release with no .mcpb.",
      "Run `npm run release:mcpb` first.",
    ];
  }

  // Packaging rewrites the file, so one older than the build is from before it.
  if (
    statSync(mcpbPath).mtimeMs <
    statSync(join(releaseDir, "build-info.json")).mtimeMs
  ) {
    return [
      `release/${MCPB_FILENAME} is older than release/build-info.json.`,
      "It was packaged from an earlier build. Run `npm run release:mcpb` again.",
    ];
  }

  return null;
}
