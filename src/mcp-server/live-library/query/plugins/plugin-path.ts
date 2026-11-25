// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  pathSegments,
  sectionPrefixed,
} from "../../../rpc/remote-script/browser/browser-device-lookup.ts";
import { pluginPathFormat } from "../../../rpc/remote-script/browser/plugin-folder-format.ts";
import { type PluginFormat } from "../../library-types.ts";

/**
 * Read what a plug-in name asks for. A bare name has no format. A browser path,
 * `Plug-Ins/<format>/<vendor>/<name>` (VST2 has no vendor folder), pins the
 * format.
 * @param wanted - The name the call used, trimmed
 * @returns The plug-in name, and its format and vendor folder (null for none)
 *   when the name is a path
 * @throws When the path's format isn't one we know, or it has no plug-in name
 */
export function parsePluginPath(wanted: string): {
  name: string;
  format?: PluginFormat;
  vendor?: string | null;
} {
  const prefixed = sectionPrefixed(wanted);

  // A path into another section names no plug-in: it fails as any name does.
  if (prefixed?.section.type !== "plugin") {
    return { name: wanted };
  }

  const [folder, ...rest] = pathSegments(prefixed.rest);
  const format = pluginPathFormat(folder);

  if (format == null) {
    throw new Error(
      `Unknown plug-in format "${folder ?? ""}" in "${wanted}": use VST3, AU or VST (VST2)`,
    );
  }

  const leaf = rest.pop();

  if (leaf == null) {
    throw new Error(`No plug-in name in "${wanted}"`);
  }

  return { name: leaf, format, vendor: rest[0] ?? null };
}
