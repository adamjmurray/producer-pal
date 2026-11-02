// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { pluginHostPartsOf } from "#src/portal/setup/plugin-host/plugin-host-part.ts";
import { type PluginHostResult } from "#src/portal/setup/plugin-host/plugin-host-install.ts";

/**
 * Say what a wrapper install did, for printing.
 *
 * @param results - What `installPluginHostWrappers` returned
 * @returns Lines to print, and whether every wrapper ended up installed
 */
export function describePluginHostInstall(results: PluginHostResult[]): {
  lines: string[];
  ok: boolean;
} {
  const parts = pluginHostPartsOf(results);
  const lines = parts.map((part) =>
    part.ok === false
      ? `failed: ${part.path} (${part.detail})`
      : `${part.status === "current" ? "already current" : part.status}: ${part.path}`,
  );

  if (parts.some((part) => part.ok == null && part.status === "updated")) {
    lines.push(
      "A Set that's already open keeps the old wrapper until it's reopened.",
    );
  }

  return { lines, ok: parts.every((part) => part.ok !== false) };
}
