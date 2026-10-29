// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { requestNode } from "#src/live-api-adapter/protocols/node-request-v8-protocol.ts";
import {
  INSTALL_WAIT_MS,
  type InstallReply,
  type InstallRequest,
  MANAGE_ROUTES,
  type ManageInstallResult,
} from "./manage-contract.ts";
import { manageInstallResult } from "./manage-install-result.ts";

/**
 * Install the remote script and this device into the User Library, in Node (V8
 * has no filesystem). Producer Pal is running, since this is the device.
 *
 * A timeout says nothing of whether the files were written. An install replaces
 * the old copy whole, so running it again is safe.
 * @param userLibrary - Absolute path to the User Library; absent means Node
 *   looks for it
 * @returns What became of each file, and what the user does next
 * @throws Error when the install was refused or failed, with the state it left
 */
export async function installFromTool(
  userLibrary?: string,
): Promise<ManageInstallResult> {
  const request: InstallRequest =
    userLibrary == null || userLibrary.trim() === ""
      ? {}
      : { userLibrary: userLibrary.trim() };
  const response = await requestNode<InstallReply>(
    MANAGE_ROUTES.install,
    request,
    INSTALL_WAIT_MS,
  );

  if (response.success && response.result != null) {
    return manageInstallResult(response.result, { running: true });
  }

  // Only a failure that provably ran no route says nothing was installed. Any
  // other (a timeout, an unreadable answer, Node's own limit) may follow a
  // route that already wrote files.
  if (response.notRun) {
    throw new Error(
      `nothing was installed: ${response.error ?? "the install did not run"}`,
    );
  }

  const why = response.timedOut
    ? "the install did not answer in time"
    : `the install failed without a clear answer (${response.error ?? "no result"})`;

  throw new Error(
    `${why}, so it may or may not have finished. Run it again: an install replaces the old copy whole`,
  );
}
