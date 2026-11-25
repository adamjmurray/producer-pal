// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { dirname } from "node:path";
import {
  libraryPathExists,
  readLibraryBytes,
  writeLibraryFile,
} from "#src/mcp-server/rpc/remote-script/user-library/user-library-fs.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  isInUseFailure,
  removeStaleTempFiles,
  replaceViaTemp,
} from "../device-file/replace-via-temp.ts";
import {
  PLUGIN_HOST_WRAPPERS,
  type PluginHostSource,
  pluginHostPath,
} from "./plugin-host-wrappers.ts";

type Wrapper = (typeof PLUGIN_HOST_WRAPPERS)[number];

/**
 * What an install did to one wrapper. `current`: already the same bytes.
 * `inUse`: Windows refused the replace, which means Live has it open.
 */
export type PluginHostResult = {
  name: string;
  fileName: string;
  /** Where the wrapper is, or would be */
  path: string;
} & (
  | { outcome: "installed" | "updated" | "current" }
  | {
      outcome: "failed";
      error: string;
      inUse: boolean;
      tempFileLeft?: string;
    }
);

/** How an installed wrapper compares with the one in the source. */
export type PluginHostState = "missing" | "current" | "differs";

/**
 * Copy the wrapper devices into a User Library, replacing any that differ.
 * Each goes through a temp file and a rename, so a failed copy keeps the old
 * file, and a failure on one wrapper doesn't stop the other. Never throws.
 *
 * Live loads a device when a Set opens, so a Set that's already open keeps the
 * old wrapper until it's reopened.
 *
 * @param userLibrary - Absolute path to an existing User Library
 * @param source - The wrappers to install, by file name
 * @returns One result per wrapper
 */
export function installPluginHostWrappers(
  userLibrary: string,
  source: PluginHostSource,
): PluginHostResult[] {
  return PLUGIN_HOST_WRAPPERS.map((wrapper) =>
    installWrapper(wrapper, pluginHostPath(userLibrary, wrapper), source),
  );
}

/**
 * How each installed wrapper compares with the source. Changes nothing.
 *
 * @param userLibrary - Absolute path to an existing User Library
 * @param source - The wrappers to compare with, by file name
 * @returns One entry per wrapper
 */
export function pluginHostStatus(
  userLibrary: string,
  source: PluginHostSource,
): { name: string; path: string; state: PluginHostState }[] {
  return PLUGIN_HOST_WRAPPERS.map((wrapper) => {
    const path = pluginHostPath(userLibrary, wrapper);

    return { name: wrapper.name, path, state: stateOf(path, wrapper, source) };
  });
}

// --- Helpers below the main exports ---

function installWrapper(
  wrapper: Wrapper,
  path: string,
  source: PluginHostSource,
): PluginHostResult {
  const { name, fileName } = wrapper;
  const base = { name, fileName, path };
  const bytes = decoded(source[fileName]);

  if (bytes == null) {
    return failed(base, "this build doesn't include it");
  }

  try {
    const existed = libraryPathExists(path);

    if (existed && readLibraryBytes(path).equals(bytes)) {
      return { ...base, outcome: "current" };
    }

    removeStaleTempFiles(dirname(path), fileName);

    const failure = replaceViaTemp(path, (temp) =>
      writeLibraryFile(temp, bytes),
    );

    if (failure != null) {
      return {
        ...base,
        outcome: "failed",
        error: errorMessage(failure.error),
        inUse: isInUseFailure(failure),
        ...(failure.tempFileLeft == null
          ? {}
          : { tempFileLeft: failure.tempFileLeft }),
      };
    }

    return { ...base, outcome: existed ? "updated" : "installed" };
  } catch (error) {
    // Something that can't be read as a file sits at the path (a folder).
    return failed(base, errorMessage(error));
  }
}

function failed(
  base: { name: string; fileName: string; path: string },
  error: string,
): PluginHostResult {
  return { ...base, outcome: "failed", error, inUse: false };
}

function stateOf(
  path: string,
  { fileName }: Wrapper,
  source: PluginHostSource,
): PluginHostState {
  const bytes = decoded(source[fileName]);

  try {
    if (!libraryPathExists(path)) {
      return "missing";
    }

    return bytes != null && readLibraryBytes(path).equals(bytes)
      ? "current"
      : "differs";
  } catch {
    return "differs";
  }
}

function decoded(base64: string | undefined): Buffer | undefined {
  return base64 == null ? undefined : Buffer.from(base64, "base64");
}
