// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  INSTALL_WAIT_MS,
  type InstallReply,
  type InstallRequest,
  MANAGE_ROUTES,
} from "./manage-contract.ts";

/** What an install tells the caller, and what is left for the user to do. */
export interface ManageInstallResult {
  version: string;
  path: string;
  nextSteps: string;
}

/**
 * Live only reads Remote Scripts at startup, so the restart comes first: until
 * then a first install isn't in the Control Surface list to choose.
 */
const NEXT_STEPS =
  'Tell the user to finish in Live: restart Live, then, on first install, choose "Producer Pal" as a Control Surface in Settings → Link, Tempo & MIDI.';

/**
 * Install the bundled remote script into the User Library, in Node (V8 has no
 * filesystem).
 *
 * No answer says nothing of whether the files were written. An install replaces
 * the old copy whole, so running it again is safe.
 * @param userLibrary - Absolute path to the User Library; absent means Node
 *   looks for it
 * @returns The version and path installed, and what the user does next
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
  const reply = response.success ? response.result : undefined;

  if (reply == null) {
    throw new Error(
      "the install did not answer in time, so it may or may not have finished. Run it again: an install replaces the old copy whole",
    );
  }

  if (!reply.installed) {
    throw new Error(reply.error);
  }

  return { version: reply.version, path: reply.path, nextSteps: NEXT_STEPS };
}
