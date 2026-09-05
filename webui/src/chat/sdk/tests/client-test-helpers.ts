// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { streamText } from "ai";
import { type vi } from "vitest";
import { type ChatMessage, type ChatClientConfig } from "#webui/chat/sdk/types";

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

/**
 * A stream that emits `parts` and then fails — how a provider stream ends when
 * the turn is aborted or the request dies partway through.
 * @param parts - Stream parts to emit before failing
 * @param error - The error to throw after the last part
 * @returns A streamText-shaped result
 */
export function failingAfterStream(
  parts: Record<string, unknown>[],
  error: unknown,
): { stream: AsyncIterable<Record<string, unknown>> } {
  async function* iterate(): AsyncIterable<Record<string, unknown>> {
    for (const p of parts) yield p;

    throw error;
  }

  return { stream: iterate() };
}

/**
 * The error an aborted fetch/stream rejects with.
 * @returns An AbortError
 */
export function abortError(): Error {
  return Object.assign(new Error("The operation was aborted."), {
    name: "AbortError",
  });
}

/**
 * A history ending in a completed tool step: the assistant announced a call
 * and its result came back. On the wire that ends on tool results, not on an
 * assistant turn.
 * @param prompt - The user turn that opened the exchange
 * @returns The two-message history
 */
export function toolStepHistory(prompt: string): ChatMessage[] {
  return [
    { role: "user", content: prompt },
    {
      role: "assistant",
      content: "Creating it.",
      toolCalls: [{ id: "t1", name: "ppal-create-clip", args: {} }],
      toolResults: [
        { id: "t1", name: "ppal-create-clip", args: {}, result: "ok" },
      ],
    },
  ];
}
