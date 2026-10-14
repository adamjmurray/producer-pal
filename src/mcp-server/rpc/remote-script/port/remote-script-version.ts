// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { outdatedReason } from "#src/tools/shared/remote-script/outdated-remote-script.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";

/**
 * The oldest remote script this server works with. Bump it to the release that
 * adds a route or changes what one answers, so an older script reads as out of
 * date instead of as missing a feature. The comparison ignores the -rcN number
 * (2.5.0-rc1 equals 2.5.0-rc2), so bump to a new x.y.z, not a new rc.
 */
export const MIN_REMOTE_SCRIPT_VERSION = "2.5.0-rc1";

/**
 * Dev switch (POST /config `remoteScriptMinVersion`): replaces the minimum, so
 * a test can make a running script look out of date. Runtime only, like
 * `remoteScriptEnabled`.
 */
let minVersionOverride: string | null = null;

/**
 * Override the minimum remote script version for this process.
 * @param version - The minimum to use, or null for the built-in one
 */
export function setRemoteScriptMinVersion(version: string | null): void {
  minVersionOverride = version;
}

/**
 * Whether a remote script is too old, and why.
 * @param running - The version the script reported, or null when not known
 * @returns The reason worded for the model, or null when it is new enough or
 *   its version isn't known
 */
export function outdatedScript(running: string | null): string | null {
  const needs = minRemoteScriptVersion();

  return running != null && isNewerVersion(running, needs)
    ? outdatedReason(running, needs)
    : null;
}

/**
 * The reason for a route the script doesn't have, when it is that kind of 404.
 * The bridge answers an unknown route with `routes` listed, which none of the
 * 404s that mean "not found" carry.
 * @param status - The reply's status
 * @param body - The reply's JSON body
 * @param running - The version the script reported, when known
 * @returns The out-of-date reason, or null for any other reply
 */
export function unknownRouteReason(
  status: number,
  body: Record<string, unknown>,
  running: string | null,
): string | null {
  const unknown =
    status === 404 &&
    typeof body.error === "string" &&
    body.error.startsWith("unknown route: ") &&
    Array.isArray(body.routes);

  return unknown ? outdatedReason(running, minRemoteScriptVersion()) : null;
}

/** @returns The minimum in force: the dev override, else the built-in one */
function minRemoteScriptVersion(): string {
  return minVersionOverride ?? MIN_REMOTE_SCRIPT_VERSION;
}
