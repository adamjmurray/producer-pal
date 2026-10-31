// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  differentBuildReason,
  outdatedReason,
  type RemoteScriptAsker,
  type RemoteScriptUnavailable,
} from "#src/tools/shared/remote-script/outdated-remote-script.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";

/**
 * The oldest remote script this server works with, so an older script reads as
 * out of date instead of as missing a feature. The version bump raises it to the
 * new release whenever the script changed since the last one, and the release
 * build refuses a stale one. -rcN tags of one x.y.z order by N; other tags
 * don't.
 */
export const MIN_REMOTE_SCRIPT_VERSION = "2.5.1-rc1";

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
 * @param asker - Who is asking: the portal words it for its own model
 * @param manage - Whether the caller can use ppal-manage
 * @returns The reason worded for the model, or null when it is new enough or
 *   its version isn't known
 */
export function outdatedScript(
  running: string | null,
  asker: RemoteScriptAsker = "device",
  manage = true,
): string | null {
  const needs = minRemoteScriptVersion();

  return running != null && isNewerVersion(running, needs)
    ? outdatedReason(running, needs, asker, manage)
    : null;
}

/**
 * The reason for a route the script doesn't have, when it is that kind of 404.
 * The bridge answers an unknown route with `routes` listed, which none of the
 * 404s that mean "not found" carry.
 * @param status - The reply's status
 * @param body - The reply's JSON body
 * @param running - The version the script reported, when known
 * @param asker - Who is asking
 * @param manage - Whether the caller can use ppal-manage
 * @returns The out-of-date reason, or null for any other reply
 */
export function unknownRouteReason(
  status: number,
  body: Record<string, unknown>,
  running: string | null,
  asker: RemoteScriptAsker = "device",
  manage = true,
): string | null {
  const unknown =
    status === 404 &&
    typeof body.error === "string" &&
    body.error.startsWith("unknown route: ") &&
    Array.isArray(body.routes);

  if (!unknown) {
    return null;
  }

  const needs = minRemoteScriptVersion();

  // New enough by version, so it's another build of it.
  return running != null && !isNewerVersion(running, needs)
    ? differentBuildReason(running, asker, manage)
    : outdatedReason(running, needs, asker, manage);
}

/**
 * An out-of-date reason worded for a caller with ppal-manage, and for one
 * without. Only V8 knows which the caller is, so both go back; the portal always
 * has the tool, so it gets one.
 * @param reason - The reason, worded for a caller with or without the tool
 * @param asker - Who is asking
 * @returns The reply fields, or null when there is no reason
 */
export function outdatedFields(
  reason: (manage: boolean) => string | null,
  asker: RemoteScriptAsker = "device",
): Pick<RemoteScriptUnavailable, "outdated" | "outdatedWithoutManage"> | null {
  const outdated = reason(true);

  if (outdated == null) {
    return null;
  }

  return asker === "portal"
    ? { outdated }
    : { outdated, outdatedWithoutManage: reason(false) ?? outdated };
}

/** @returns The minimum in force: the dev override, else the built-in one */
function minRemoteScriptVersion(): string {
  return minVersionOverride ?? MIN_REMOTE_SCRIPT_VERSION;
}
