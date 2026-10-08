// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { VERSION } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  INSTALL_ROUTE_TIMEOUT_MS,
  type InstallReply,
  MANAGE_ROUTES,
} from "#src/tools/core/helpers/manage-contract.ts";
import { findUserLibraryPath } from "../../../live-library/query/user-library-path.ts";
import { registerNodeRoute } from "../../node-request-protocol.ts";
import { optionalString } from "../../route-string-args.ts";
import { installRemoteScript } from "./remote-script-install.ts";
import { UserLibraryFolderError } from "../user-library/user-library-folder.ts";

/** How to get the User Library path, for a call that can't find it. */
const ASK_FOR_LIBRARY =
  "Ask the user for the path (Live: Settings → Library → Location of User Library) and pass it as userLibrary";

/**
 * Register the route V8 uses to install the remote script from the ppal-manage
 * tool. V8 has no filesystem, so the install runs here.
 */
export function registerRemoteScriptInstallRoute(): void {
  registerNodeRoute(
    MANAGE_ROUTES.install,
    installFromRoute,
    INSTALL_ROUTE_TIMEOUT_MS,
  );
}

/**
 * Install the bundled script into the given User Library, or the one found.
 * Failures come back worded for the model, with the state they left.
 * @param args - `{ userLibrary? }`
 * @returns The version and path installed, or why it wasn't
 */
async function installFromRoute(args: unknown): Promise<InstallReply> {
  const given = optionalString(args, "userLibrary").trim();
  const userLibrary = given === "" ? await findUserLibraryPath() : given;

  if (userLibrary == null) {
    return {
      installed: false,
      error: `couldn't find Live's User Library, so nothing was installed. ${ASK_FOR_LIBRARY}`,
    };
  }

  try {
    return {
      installed: true,
      version: VERSION,
      path: installRemoteScript(userLibrary).path,
    };
  } catch (error) {
    return { installed: false, error: failureText(error) };
  }
}

/**
 * Word a failed install, including what it left behind. The install writes to a
 * temp folder and swaps it in, so a failed write leaves any old install as it
 * was; only a swap that can't be undone moves it aside, and its error says where.
 * @param error - What the install threw
 * @returns The reason and the state, worded for the model
 */
function failureText(error: unknown): string {
  const message = errorMessage(error);

  if (error instanceof UserLibraryFolderError) {
    return `${message}; nothing was installed. ${ASK_FOR_LIBRARY}`;
  }

  return message.includes("old install left at")
    ? `the install failed (${message}). The previous copy was moved aside and not put back, so the remote script is missing until you run the install again`
    : `the install failed (${message}). Nothing half-written was kept, and any previous install is unchanged`;
}
