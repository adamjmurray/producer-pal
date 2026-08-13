// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { execSync } from "node:child_process";

/**
 * The build identity baked into every bundle: the short commit SHA this build
 * came from.
 *
 * A version number alone can't tell two builds of the same version apart, so a
 * pre-release tester who downloads an early release candidate keeps reporting
 * that version after the artifacts are re-cut under the same tag. Diagnostic
 * only: it answers "which commit produced these bytes" when a bug report and a
 * version number disagree. The update check does NOT read it — every build now
 * carries its own -rcN, so the version string alone answers that.
 *
 * Releases pass BUILD_SHA in explicitly (scripts/build-and-release/
 * prepare-release.ts) so the baked value and the published marker come from one
 * computation; the git fallback covers local dev builds. Resolved once at
 * config load, before any bundle is written.
 *
 * Always a string — never undefined — so the build-time substitution is always
 * a valid literal in the Max V8 runtime and the browser bundle, neither of
 * which has a `process` global.
 */
export const BUILD_SHA = resolveBuildSha();

/**
 * Resolve the build SHA from the environment, falling back to git HEAD.
 * @returns The short commit SHA, or "" when it can't be determined
 */
function resolveBuildSha() {
  if (process.env.BUILD_SHA) {
    return process.env.BUILD_SHA;
  }

  try {
    return execSync("git rev-parse --short=7 HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}
