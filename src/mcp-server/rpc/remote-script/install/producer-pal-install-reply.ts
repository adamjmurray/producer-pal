// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import {
  type InstallPart,
  type InstallReply,
} from "#src/tools/core/helpers/manage-contract.ts";
import {
  resolveUserLibraryFolder,
  UserLibraryFolderError,
} from "../user-library/user-library-folder.ts";
import { ASK_FOR_LIBRARY } from "./remote-script-install-reply.ts";

/** What an install does, so the device and the portal can each supply theirs. */
export interface ProducerPalInstallSteps {
  /** Live's User Library, or null when it can't be found */
  findUserLibrary: () => Promise<string | null>;
  /** Install the remote script into a User Library; never throws */
  installRemoteScript: (library: string) => InstallPart;
  /** Install the device into a User Library; never throws */
  installDevice: (library: string) => InstallPart;
}

/**
 * Install the remote script and the device into one User Library: the given
 * one, else the one found. A bad library fails both before either is tried; a
 * failure of one doesn't stop the other, and each reports for itself. Used by
 * the Node route the device calls and by the portal when the device is
 * offline.
 * @param given - Absolute path to the User Library; blank or absent means find it
 * @param steps - The lookup and the two installs
 * @returns Each file's outcome, or why neither was tried
 */
export async function installProducerPalReply(
  given: string | undefined,
  steps: ProducerPalInstallSteps,
): Promise<InstallReply> {
  const trimmed = (given ?? "").trim();
  let library: string | null;

  try {
    library =
      trimmed === ""
        ? await steps.findUserLibrary()
        : resolveUserLibraryFolder(trimmed);
  } catch (error) {
    return { ran: false, error: libraryError(error) };
  }

  if (library == null) {
    return {
      ran: false,
      error: `couldn't find Live's User Library, so nothing was installed. ${ASK_FOR_LIBRARY}`,
    };
  }

  return {
    ran: true,
    remoteScript: steps.installRemoteScript(library),
    device: steps.installDevice(library),
  };
}

/**
 * @param error - What the library lookup threw
 * @returns Why nothing was installed
 */
function libraryError(error: unknown): string {
  return error instanceof UserLibraryFolderError
    ? `${error.message}; nothing was installed. ${ASK_FOR_LIBRARY}`
    : `couldn't look up Live's User Library (${errorMessage(error)}), so nothing was installed. ${ASK_FOR_LIBRARY}`;
}
