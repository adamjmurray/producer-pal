// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";

/**
 * Default ChatInput props with fresh mock callbacks.
 * @returns Props for rendering ChatInput
 */
export function chatInputProps() {
  return {
    handleSend: vi.fn(),
    onEnqueue: vi.fn(),
    isAssistantResponding: false,
    hasError: false,
    onStop: vi.fn(),
    thinking: "Default",
    onThinkingChange: vi.fn(),
  };
}
