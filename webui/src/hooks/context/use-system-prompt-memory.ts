// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getSystemPromptUrl } from "#webui/utils/mcp-url";
import { type UseDocMemoryReturn, useDocMemory } from "./use-doc-memory";

interface SystemPromptResponse {
  content?: string;
}

/**
 * Read and write the user's custom system prompt (~/.producer-pal/
 * system-prompt.md) via the backend `/system-prompt` endpoint. Empty means
 * "use the built-in instruction"; any content fully replaces it for the webui
 * chat. A thin transport over the shared {@link useDocMemory} core — mounted
 * both in the Instructions editor tab and at the chat level (which reads
 * `status.content` to compose each request's system instruction).
 * @returns System prompt state plus save/refresh actions
 */
export function useSystemPromptMemory(): UseDocMemoryReturn {
  return useDocMemory(readSystemPrompt, writeSystemPrompt);
}

// --- Helpers below main export ---

/**
 * GET the custom system prompt file contents. Bypasses the browser cache so
 * external writes (hand edits, the editor in another tab) surface on reload.
 * @returns The stored content ("" when absent)
 */
async function readSystemPrompt(): Promise<string> {
  const response = await fetch(getSystemPromptUrl(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `System prompt request failed (${response.status} ${response.statusText})`,
    );
  }

  const body = (await response.json()) as SystemPromptResponse;

  return body.content ?? "";
}

/**
 * PUT new system prompt content, returning the server's byte-faithful echo.
 * @param content - New system prompt markdown
 * @returns The stored content echoed by the server
 */
async function writeSystemPrompt(content: string): Promise<string> {
  const response = await fetch(getSystemPromptUrl(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(
      `System prompt update failed (${response.status} ${response.statusText})`,
    );
  }

  const body = (await response.json()) as SystemPromptResponse;

  return body.content ?? "";
}
