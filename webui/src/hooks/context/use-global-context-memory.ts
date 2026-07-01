// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getGlobalContextUrl } from "#webui/utils/mcp-url";
import { type UseDocMemoryReturn, useDocMemory } from "./use-doc-memory";

interface GlobalContextResponse {
  content?: string;
}

/**
 * Read and write the machine-global user context (~/.producer-pal/context.md)
 * via the backend `/global-context` endpoint — persistent facts that apply
 * across every project, distinct from the per-project `/config` memory. A thin
 * transport over the shared {@link useDocMemory} core.
 * @returns Global context state plus save/refresh actions
 */
export function useGlobalContextMemory(): UseDocMemoryReturn {
  return useDocMemory(readGlobalContext, writeGlobalContext);
}

// --- Helpers below main export ---

/**
 * GET the global context file contents. Bypasses the browser cache so external
 * writes (hand edits, the reveal-folder button) surface on reload.
 * @returns The stored content ("" when absent)
 */
async function readGlobalContext(): Promise<string> {
  const response = await fetch(getGlobalContextUrl(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Global context request failed (${response.status} ${response.statusText})`,
    );
  }

  const body = (await response.json()) as GlobalContextResponse;

  return body.content ?? "";
}

/**
 * PUT new global context content, returning the server's byte-faithful echo.
 * @param content - New global context markdown
 * @returns The stored content echoed by the server
 */
async function writeGlobalContext(content: string): Promise<string> {
  const response = await fetch(getGlobalContextUrl(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(
      `Global context update failed (${response.status} ${response.statusText})`,
    );
  }

  const body = (await response.json()) as GlobalContextResponse;

  return body.content ?? "";
}
