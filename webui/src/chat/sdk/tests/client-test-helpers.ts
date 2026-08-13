// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { streamText } from "ai";
import { type vi } from "vitest";
import { type ChatClientConfig } from "#webui/chat/sdk/types";

/**
 * Create a mock ChatClientConfig. Defaults to the openai provider; pass a
 * `provider` override for provider-specific tests (e.g. anthropic reasoning).
 * @param overrides - Config overrides
 * @returns Mock ChatClientConfig
 */
export function createConfig(
  overrides?: Partial<ChatClientConfig>,
): ChatClientConfig {
  return {
    model: {
      modelId: "test",
      provider: "openai",
      specificationVersion: "v3",
    } as never,
    ...overrides,
  };
}

/**
 * Point the mocked `streamText` at a stream that yields the given parts. The
 * cast assumes `ai` is mocked with `streamText: vi.fn()` in the test file.
 * @param parts - Stream parts to emit
 */
export function mockStreamParts(parts: Record<string, unknown>[]): void {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;
  }

  (streamText as ReturnType<typeof vi.fn>).mockReturnValue({
    stream: iterate(),
  });
}
