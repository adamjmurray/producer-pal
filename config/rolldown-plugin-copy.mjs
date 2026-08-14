// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { cpSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

/**
 * Rolldown plugin to copy static files into a bundle's output directory.
 *
 * Each target's `src` (a path or list of paths, file or directory) lands at
 * `dest/<basename>`, which is what the distribution folders expect.
 *
 * @param targets - Copy targets, each `{ src, dest }`
 * @returns The plugin
 */
export function copyFiles(targets) {
  return {
    name: "copy-files",
    // buildEnd, not writeBundle: these are static repo files, unrelated to the
    // bundle, and the portal config writes two outputs — writeBundle would copy
    // them twice.
    buildEnd() {
      for (const { src, dest } of targets) {
        mkdirSync(dest, { recursive: true });

        for (const from of Array.isArray(src) ? src : [src]) {
          cpSync(from, join(dest, basename(from)), { recursive: true });
        }
      }
    },
  };
}
