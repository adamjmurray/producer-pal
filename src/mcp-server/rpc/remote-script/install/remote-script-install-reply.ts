// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { VERSION } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { type InstallPart } from "#src/tools/core/helpers/manage-contract.ts";
import { installRemoteScript } from "./remote-script-install.ts";
import { UserLibraryFolderError } from "../user-library/user-library-folder.ts";

/** How to get the User Library path, for a call that can't find it. */
export const ASK_FOR_LIBRARY =
  "Ask the user for the path (Live: Settings → Library → Location of User Library) and pass it as userLibrary";

/**
 * Install the bundled script into a User Library. A failure comes back worded
 * for the model, with the state it left. Used by the Node route the device
 * calls and by the portal when the device is offline.
 * @param userLibrary - Path to the User Library folder
 * @returns The version and path installed, or why it wasn't
 */
export function installRemoteScriptPart(userLibrary: string): InstallPart {
  try {
    return {
      status: "installed",
      version: VERSION,
      path: installRemoteScript(userLibrary).path,
    };
  } catch (error) {
    return { ok: false, detail: failureText(error) };
  }
}

/**
 * Say what a failed install left. The new copy is written to a temp folder and
 * swapped in, so the old install stays as it was unless the swap couldn't be
 * undone. The install's error names anything it couldn't clean up.
 * @param message - The install's error message
 * @returns What's left of the old install and the new copy
 */
export function installLeftText(message: string): string {
  if (message.includes("old install left at")) {
    return "The previous copy was moved aside and not put back, so the remote script is missing until you run the install again";
  }

  return message.includes("new copy left at")
    ? "Any previous install is unchanged"
    : "Nothing half-written was kept, and any previous install is unchanged";
}

/**
 * Word a failed install, including what it left behind.
 * @param error - What the install threw
 * @returns The reason and the state, worded for the model
 */
function failureText(error: unknown): string {
  const message = errorMessage(error);

  if (error instanceof UserLibraryFolderError) {
    return `${message}; nothing was installed. ${ASK_FOR_LIBRARY}`;
  }

  return `install failed (${message}). ${installLeftText(message)}`;
}
