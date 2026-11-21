// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";

/**
 * The major version of a Live app, read from its bundle.
 *
 * @param app - App name for `open -a` (like "Ableton Live 12 Suite"), or an absolute bundle path
 * @returns The major version, or null when it can't be read
 */
export function liveAppMajorVersion(app: string): number | null {
  const bundle = app.startsWith("/") ? app : `/Applications/${app}.app`;

  try {
    // Reads like "13.0b25 (2026-11-03_a87e6d71e7)".
    const version = execFileSync(
      "/usr/bin/plutil",
      [
        "-extract",
        "CFBundleShortVersionString",
        "raw",
        "-o",
        "-",
        `${bundle}/Contents/Info.plist`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const major = /^\d+/.exec(version.trim())?.[0];

    return major == null ? null : Number(major);
  } catch {
    return null;
  }
}
