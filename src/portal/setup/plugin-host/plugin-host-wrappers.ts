// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { join } from "node:path";

/**
 * The plug-in host wrapper devices, and the folder Live files each one under.
 * `name` is what Live's browser calls it (`WRAPPER_NAMES` in the tools).
 */
export const PLUGIN_HOST_WRAPPERS = [
  {
    name: "PPal Plug-in Effect",
    fileName: "PPal Plug-in Effect.amxd",
    folder: ["Presets", "Audio Effects", "Max Audio Effect"],
  },
  {
    name: "PPal Plug-in Instrument",
    fileName: "PPal Plug-in Instrument.amxd",
    folder: ["Presets", "Instruments", "Max Instrument"],
  },
] as const;

/** The wrapper files' bytes, base64, keyed by file name. */
export type PluginHostSource = Record<string, string>;

/**
 * @param userLibrary - Absolute path to the User Library
 * @param wrapper - One of {@link PLUGIN_HOST_WRAPPERS}
 * @returns Where that wrapper is, or would be
 */
export function pluginHostPath(
  userLibrary: string,
  wrapper: (typeof PLUGIN_HOST_WRAPPERS)[number],
): string {
  return join(userLibrary, ...wrapper.folder, wrapper.fileName);
}
