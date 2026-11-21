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

/**
 * The format a typed path segment names. Stricter than a Live folder: a vendor
 * like "Audio Damage" must not read as AU. `VST2` is `VST`.
 * @param segment - The first segment under `Plug-Ins/`
 * @returns The format, or null when the segment names none
 */
export function pluginPathFormat(
  segment: string | undefined,
): PluginFormat | null {
  const name = segment?.trim().toLowerCase() ?? "";

  if (name === "vst2") {
    return "VST";
  }

  return /^(?:vst3?|au(?:v\d)?)$/.test(name) ? pluginFolderFormat(name) : null;
}
