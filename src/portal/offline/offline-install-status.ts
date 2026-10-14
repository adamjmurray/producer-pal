// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What is installed where, for the offline guidance to name. Every lookup that
// fails drops its detail instead of failing the call.

import { type InstalledRemoteScript } from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { type RemoteScriptPing } from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { type DeviceFileStatus } from "../setup/device-file-status.ts";
import { type OfflineDeps } from "./offline-deps.ts";

/** What the guidance knows about this machine. */
export interface OfflineInstallStatus {
  /** Live's User Library, or null when it can't be found */
  library: string | null;
  /** The remote script in that library; absent when running, or not readable */
  script?: InstalledRemoteScript;
  /** Whether this portal shipped with the device */
  bundled: boolean;
  /** The device in that library against the bundled one; absent when unknown */
  device?: DeviceFileStatus;
}

type StatusDeps = Pick<
  OfflineDeps,
  | "findUserLibrary"
  | "findBundledDevice"
  | "installedRemoteScript"
  | "deviceFileStatus"
>;

/**
 * Look at the User Library, the remote script and the device file.
 * @param ping - The remote script's answer, already asked for
 * @param deps - The lookups
 * @returns What was found, or undefined when the library or bundle lookup failed
 */
export async function offlineInstallStatus(
  ping: RemoteScriptPing,
  deps: StatusDeps,
): Promise<OfflineInstallStatus | undefined> {
  try {
    const library = await firstUserLibrary([ping.userLibrary], deps);
    const bundled = deps.findBundledDevice();

    return {
      library,
      bundled: bundled != null,
      script:
        library == null || ping.running
          ? undefined
          : attempt(() => deps.installedRemoteScript(library)),
      device:
        library == null || bundled == null
          ? undefined
          : attempt(() => deps.deviceFileStatus(library, bundled)),
    };
  } catch {
    return undefined;
  }
}

/**
 * @param known - The libraries the call and the remote script named, best first
 * @param deps - The lookup of last resort
 * @returns The first one named, else the one Producer Pal finds, else null
 */
export async function firstUserLibrary(
  known: Array<string | null | undefined>,
  deps: Pick<OfflineDeps, "findUserLibrary">,
): Promise<string | null> {
  const named = known.find((path) => path != null && path !== "");

  return named ?? (await deps.findUserLibrary());
}

/**
 * @param read - A lookup that may throw
 * @returns What it returned, or undefined when it threw
 */
function attempt<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}
