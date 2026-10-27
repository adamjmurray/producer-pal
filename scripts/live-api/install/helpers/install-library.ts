// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { findUserLibraryPath } from "#src/mcp-server/live-library/query/user-library-path.ts";
import { resolveUserLibraryFolder } from "#src/mcp-server/rpc/remote-script/user-library/user-library-folder.ts";
import { errorMessage } from "#src/shared/error-message.ts";

export interface InstallLibrary {
  /** Absolute path to the User Library */
  path: string;
  /** Where the path came from */
  source: "ABLETON_USER_LIBRARY" | "found";
}

/** The User Library couldn't be resolved. The message says what to do. */
export class InstallLibraryError extends Error {}

/**
 * Pick the User Library the install and uninstall scripts work on:
 * ABLETON_USER_LIBRARY if set, otherwise the one Live is using.
 *
 * @param envValue - The ABLETON_USER_LIBRARY value, a leading `~` allowed
 * @param find - Finds Live's User Library when the variable is unset
 * @returns The library and where it came from
 * @throws {InstallLibraryError} When the variable is bad, or nothing is found
 */
export async function resolveInstallLibrary(
  envValue: string | undefined = process.env.ABLETON_USER_LIBRARY,
  find: () => Promise<string | null> = findUserLibraryPath,
): Promise<InstallLibrary> {
  if (envValue != null && envValue !== "") {
    try {
      return {
        path: resolveUserLibraryFolder(envValue),
        source: "ABLETON_USER_LIBRARY",
      };
    } catch (error) {
      throw new InstallLibraryError(
        `ABLETON_USER_LIBRARY: ${errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  const found = await find();

  if (found == null) {
    throw new InstallLibraryError(
      "Couldn't find your Ableton User Library. Set ABLETON_USER_LIBRARY in .env (see .env.example).",
    );
  }

  return { path: found, source: "found" };
}

/**
 * {@link resolveInstallLibrary} for a command: on failure, print the reason
 * and exit 1.
 *
 * @returns The library, announced on stdout
 */
export async function resolveInstallLibraryOrExit(): Promise<InstallLibrary> {
  try {
    const library = await resolveInstallLibrary();

    console.log(`User Library: ${describeInstallLibrary(library)}`);

    return library;
  } catch (error) {
    console.error(errorMessage(error));

    return process.exit(1);
  }
}

/**
 * @param library - The resolved library
 * @returns The path, with how it was chosen
 */
export function describeInstallLibrary(library: InstallLibrary): string {
  return library.source === "found"
    ? `${library.path} (found; set ABLETON_USER_LIBRARY in .env to pin it)`
    : `${library.path} (from ABLETON_USER_LIBRARY)`;
}
