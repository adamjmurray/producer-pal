// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { useSystemPromptMemory } from "#webui/hooks/context/use-system-prompt-memory";
import { describeDocMemoryTransport } from "./doc-memory-transport-test-helpers";

// happy-dom defaults to http://localhost:3000/, so the same-origin endpoint
// resolves to localhost:3000/system-prompt.
describeDocMemoryTransport({
  hookName: "useSystemPromptMemory",
  useHook: useSystemPromptMemory,
  url: "http://localhost:3000/system-prompt",
  readError: "System prompt request failed",
  writeError: "System prompt update failed",
});
