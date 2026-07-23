// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getConfigUrl } from "#webui/utils/mcp-url";
import { type DocRead, type UseDocReturn, useDoc } from "./use-doc";

interface ConfigResponse {
  projectContext?: string;
  // Other config fields exist but are not relevant to the editor.
  [key: string]: unknown;
}

/**
 * Read and write the project context blob via the device's `/config` REST
 * endpoint — the same channel the Max device uses for the inline project-context
 * textedit. A thin transport over the shared {@link useDoc} core.
 * @returns Project context state plus save/refresh actions
 */
export function useProjectContext(): UseDocReturn {
  return useDoc(readConfigProjectContext, writeConfigProjectContext);
}

// --- Helpers below main export ---

/**
 * Read the project context from the config endpoint.
 * @returns The current projectContext ("" when absent). Project context has no
 *   built-in default, so it never carries drift.
 */
async function readConfigProjectContext(): Promise<DocRead> {
  const config = await fetchConfig();

  return { content: config.projectContext ?? "" };
}

/**
 * Write the project context via a partial config POST.
 * @param content - New project context content
 * @returns The stored projectContext echoed by the server
 */
async function writeConfigProjectContext(content: string): Promise<DocRead> {
  const config = await postConfig({ projectContext: content });

  return { content: config.projectContext ?? "" };
}

/**
 * GET the device config object. Bypasses the browser cache so the editor
 * always reflects the device's current project context on page load and after
 * AI writes that occurred while the tab was elsewhere.
 * @returns Parsed config response
 */
async function fetchConfig(): Promise<ConfigResponse> {
  const response = await fetch(getConfigUrl(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Config request failed (${response.status} ${response.statusText})`,
    );
  }

  return (await response.json()) as ConfigResponse;
}

/**
 * POST a partial config update. The server merges and emits to the Max
 * device, then echoes the full updated config.
 * @param partial - Fields to update
 * @returns Updated config response
 */
async function postConfig(
  partial: Partial<ConfigResponse>,
): Promise<ConfigResponse> {
  const response = await fetch(getConfigUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(partial),
  });

  if (!response.ok) {
    throw new Error(
      `Config update failed (${response.status} ${response.statusText})`,
    );
  }

  return (await response.json()) as ConfigResponse;
}
