// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// `release:mcpb` rebuilds the portal, so a debug build can slip in even when
// the frozen device is clean. Refuses a shipped portal built with dev flags.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkNotDevBuild } from "../frozen-device.ts";

/** The portal bundle the mcpb and the npm package both ship. */
export const PORTAL_FILENAME = "producer-pal-portal.js";

/**
 * Check that each folder holds a portal built without dev-only flags.
 *
 * @param dirs - Folders that must each hold a release portal
 * @returns What to print before refusing, or null when every copy is clean
 */
export function checkPackagedPortals(dirs: string[]): string | null {
  for (const dir of dirs) {
    const portalPath = join(dir, PORTAL_FILENAME);

    if (!existsSync(portalPath)) {
      return `${portalPath} not found.\nRun \`npm run release:mcpb\` (after \`npm run release:amxd\`).`;
    }

    const devBuild = checkNotDevBuild(portalPath, readFileSync(portalPath));

    if (devBuild != null) {
      return `${devBuild}\nUnset the dev flags and run \`npm run release\` again.`;
    }
  }

  return null;
}
