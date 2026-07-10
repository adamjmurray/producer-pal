// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getConfigUrl } from "#webui/utils/mcp-url";
import {
  type DocRead,
  type UseDocMemoryReturn,
  useDocMemory,
} from "./use-doc-memory";

interface ConfigResponse {
  memoryContent?: string;
  // Other config fields exist but are not relevant to the editor.
  [key: string]: unknown;
}

/**
 * Read and write the project context memory blob via the device's `/config`
 * REST endpoint — the same channel the Max device uses for the inline memory
 * textedit. A thin transport over the shared {@link useDocMemory} core.
 * @returns Memory state plus save/refresh actions
 */
export function useContextMemory(): UseDocMemoryReturn {
  return useDocMemory(readConfigMemory, writeConfigMemory);
}

// --- Helpers below main export ---

/**
 * Read the project memory from the config endpoint.
 * @returns The current memoryContent ("" when absent). Project memory has no
 *   built-in default, so it never carries drift.
 */
async function readConfigMemory(): Promise<DocRead> {
  const config = await fetchConfig();

  return { content: config.memoryContent ?? "" };
}

/**
 * Write the project memory via a partial config POST.
 * @param content - New memory content
 * @returns The stored memoryContent echoed by the server
 */
async function writeConfigMemory(content: string): Promise<DocRead> {
  const config = await postConfig({ memoryContent: content });

  return { content: config.memoryContent ?? "" };
}

/**
 * GET the device config object. Bypasses the browser cache so the editor
 * always reflects the device's current memory on page load and after AI
 * writes that occurred while the tab was elsewhere.
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
