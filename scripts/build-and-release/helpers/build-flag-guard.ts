// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Keeps dev-only flags out of a build that ships. rolldown bakes their values
// into the bundles, so whatever the shell happens to export is what users get:
// one leftover `export ENABLE_CODE_EXEC=true` ships node:vm execution wired into
// the clip tools. Nothing downstream would notice — the tag, build-info.json and
// the bundle tests never look at the artifacts' flags.

/**
 * The flags the build substitutes. Not a prefix match on ENABLE_*: that
 * namespace isn't ours, and GitHub's runners export ENABLE_RUNNER_TRACING.
 *
 * Nothing here has to be remembered. src/test/meta/build/build-flags.test.ts
 * already fails on a flag read in src/ that isn't classified, and holds this
 * list equal to the build-flag half of that inventory — so a new flag fails the
 * suite until it is listed here too. Runtime flags stay out on purpose: the
 * portal reads ENABLE_LOGGING when it runs, so the build never bakes it in.
 *
 * ENABLE_BUILD_STATS is here even though src/ never reads it: it picks which
 * module the bundler resolves rather than a value to substitute, and it still
 * changes the shipped bytes.
 */
export const GUARDED_BUILD_FLAGS: string[] = [
  "ENABLE_LIVE_API",
  "ENABLE_CODE_EXEC",
  "ENABLE_WARP_MARKERS",
  "ENABLE_REMOTE_CORS",
  "ENABLE_BUILD_STATS",
  "ENABLE_OBJECT_PROBE",
];

/** Set to "true" alongside the flags to build with them on purpose. */
export const DEV_BUILD_OVERRIDE = "ALLOW_DEV_BUILD_FLAGS";

/**
 * Written into the header of every bundle built with any guarded flag set, so
 * the release steps can tell a debug device from a release one by its bytes.
 */
export const DEV_BUILD_MARKER = "PRODUCER_PAL_DEV_BUILD";

/**
 * The guarded flags the environment sets (to anything but empty).
 * @param env - The environment the build runs with
 * @returns The names of the flags that are set
 */
function flagsSet(env: Record<string, string | undefined>): string[] {
  return GUARDED_BUILD_FLAGS.filter(
    (flag) => env[flag] != null && env[flag] !== "",
  );
}

/**
 * Whether a build run with this environment bakes in a dev-only flag. True even
 * with the override: the override lets the build run, not ship.
 * @param env - The environment the build runs with
 * @returns True when the bundles carry DEV_BUILD_MARKER
 */
export function hasDevBuildFlags(
  env: Record<string, string | undefined>,
): boolean {
  return flagsSet(env).length > 0;
}

/**
 * Checks the environment a build is about to run with.
 * @param env - The environment the build will run with
 * @returns What to print before refusing, or null when the environment is clean
 */
export function buildFlagGuard(
  env: Record<string, string | undefined>,
): string | null {
  // "true" exactly, like every flag the build reads — a shell that means to
  // opt in can spell it the one way the refusal below prints.
  if (env[DEV_BUILD_OVERRIDE] === "true") {
    return null;
  }

  const set = flagsSet(env);

  if (set.length === 0) {
    return null;
  }

  return [
    "\n❌ Refusing to build: dev-only build flags are set in this environment.\n",
    ...set.map((flag) => `     ${flag}=${env[flag]}`),
    "\n   The build bakes them into the bundles, and they enable Live API access,",
    "   arbitrary code execution, wildcard CORS, unfinished features, the",
    "   LiveAPI object counter, and the object-staleness probe. None of that\n   may ship.\n",
    "   • For a development build:  npm run build:debug",
    `   • On purpose, this once:    ${DEV_BUILD_OVERRIDE}=true npm run build\n`,
  ].join("\n");
}
