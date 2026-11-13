// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type PluginFormat } from "../../../live-library/library-types.ts";

/**
 * The plug-in format a folder at the top of Live's Plug-Ins browser holds.
 * @param folder - The top folder of a plug-in's path (VST3, VST, AUv2)
 * @returns The format, or null when the folder isn't one we know
 */
export function pluginFolderFormat(
  folder: string | undefined,
): PluginFormat | null {
  const name = folder?.toLowerCase() ?? "";

  if (name === "vst3") {
    return "VST3";
  }

  if (name === "vst") {
    return "VST";
  }

  // Live 12 names it "AUv2". Any "AU…" matches, in case a later one differs.
  return name.startsWith("au") ? "AU" : null;
}
