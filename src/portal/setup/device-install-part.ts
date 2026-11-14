// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { UPDATE_PORTAL_ADVICE } from "#src/shared/config.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { type InstallPart } from "#src/tools/core/helpers/manage-contract.ts";
import { type DeviceInstallResult } from "./device-install.ts";

/**
 * Whose device file was copied, which words the detail on a copy that was left
 * alone: the running device's own, or the one that shipped with the portal.
 */
export type DeviceSource = "device" | "portal";

/**
 * What ppal-manage install-producer-pal reports for the device file.
 * @param result - What the copy did
 * @param source - Whose file was copied
 * @returns The outcome, with a detail when there is something to know
 */
export function installPartOfDevice(
  result: DeviceInstallResult,
  source: DeviceSource,
): InstallPart {
  const { path, bundledVersion: version } = result;
  const base = { path, ...(version == null ? {} : { version }) };

  switch (result.outcome) {
    case "installed":
    case "current":
      return { status: result.outcome, ...base };
    case "updated":
      return { status: "updated", ...base, detail: result.detail };
    case "skipped":
      return { status: "kept", ...base, detail: keptNote(result, source) };
    default:
      return {
        ok: false,
        path,
        detail: `${result.detail} Cause: ${result.error ?? "unknown"}.`,
      };
  }
}

/**
 * @param result - A copy that left the installed device alone
 * @param source - Whose file would have been copied
 * @returns Why it was left, and what the user can do when the source is older
 */
function keptNote(result: DeviceInstallResult, source: DeviceSource): string {
  const { previousVersion, bundledVersion } = result;
  const ours = source === "portal" ? "this portal's" : "this device's";
  const kept = `left the installed device (${previousVersion ?? "unknown version"}) as it is`;

  if (
    previousVersion != null &&
    bundledVersion != null &&
    isNewerVersion(bundledVersion, previousVersion)
  ) {
    const advice = source === "portal" ? ` ${UPDATE_PORTAL_ADVICE}` : "";

    return `${kept}: it is newer than ${ours} (${bundledVersion}).${advice}`;
  }

  return `${kept}: it differs from ${ours} (${bundledVersion ?? "unknown version"}) and which is newer can't be told.`;
}
