// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What the portal's offline answers reach out to. A seam so the tests can run
// them without a network or a filesystem.

import { setTimeout as delay } from "node:timers/promises";
import { findUserLibraryPath } from "#src/mcp-server/live-library/query/user-library-path.ts";
import { installRemoteScriptReply } from "#src/mcp-server/rpc/remote-script/install/remote-script-install-reply.ts";
import {
  remoteScriptPing,
  remoteScriptRequest,
  type RemoteScriptPing,
  type RemoteScriptReply,
  type RemoteScriptRequest,
} from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import {
  installedRemoteScript,
  type InstalledRemoteScript,
} from "#src/mcp-server/rpc/remote-script/remote-script-status.ts";
import { libraryPathExists } from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import { type InstallReply } from "#src/tools/core/helpers/manage-contract.ts";
import { findBundledDevice } from "../setup/bundled-device.ts";
import {
  type DeviceFileStatus,
  deviceFileStatus,
} from "../setup/device-file-status.ts";
import {
  type DeviceInstallResult,
  installDevice,
} from "../setup/device-install.ts";

export interface OfflineDeps {
  /** Whether the remote script answers. Never throws. */
  ping: () => Promise<RemoteScriptPing>;
  /** One request to the remote script */
  request: (request: RemoteScriptRequest) => Promise<RemoteScriptReply>;
  /** Install the remote script; `userLibrary` absent means find it */
  installRemoteScript: (userLibrary?: string) => Promise<InstallReply>;
  /** Live's User Library, or null when it can't be found */
  findUserLibrary: () => Promise<string | null>;
  /** The device file that shipped with this portal, or null for none */
  findBundledDevice: () => string | null;
  /** Copy the bundled device into a User Library */
  installDevice: (userLibrary: string, source: string) => DeviceInstallResult;
  /** The remote script in a User Library, installed or not */
  installedRemoteScript: (userLibrary: string) => InstalledRemoteScript;
  /** How the device in a User Library compares with the bundled one */
  deviceFileStatus: (userLibrary: string, bundled: string) => DeviceFileStatus;
  fileExists: (path: string) => boolean;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export const realOfflineDeps: OfflineDeps = {
  ping: remoteScriptPing,
  request: remoteScriptRequest,
  installRemoteScript: installRemoteScriptReply,
  findUserLibrary: findUserLibraryPath,
  findBundledDevice,
  installDevice,
  installedRemoteScript,
  deviceFileStatus,
  fileExists: libraryPathExists,
  sleep: delay,
  now: Date.now,
};
