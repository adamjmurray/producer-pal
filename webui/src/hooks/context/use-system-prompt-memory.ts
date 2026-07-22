// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getSystemPromptUrl } from "#webui/utils/mcp-url";
import {
  makeContentTransport,
  type UseDocMemoryReturn,
  useDocMemory,
} from "./use-doc-memory";

// Module-scope so the transport is a stable reference across renders (the
// origin is fixed for the page's lifetime — see useDocMemory's read/write note).
const { read, write } = makeContentTransport(
  getSystemPromptUrl(),
  "System prompt",
);

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
  return useDocMemory(read, write);
}
