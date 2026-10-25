// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type GenUiEvent } from "#src/shared/gen-ui-types.ts";

export interface TestEventStream {
  /** The next event, skipping comments; rejects if none arrives in a second. */
  next: () => Promise<GenUiEvent>;
  /** The next raw block (an event, a comment, a `retry:` line). */
  nextBlock: () => Promise<string>;
  close: () => Promise<void>;
}

/**
 * Open a server-sent event stream the way a browser would, and read it one
 * block at a time.
 *
 * @param url - The stream's URL
 * @returns Reader for the stream
 */
export async function openEventStream(url: string): Promise<TestEventStream> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });

  if (!response.ok || response.body == null) {
    throw new Error(`Event stream refused: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const nextBlock = async (): Promise<string> => {
    while (!buffer.includes("\n\n")) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("No event arrived")), 1000),
        ),
      ]);

      if (chunk.done) {
        throw new Error("Event stream ended");
      }

      buffer += decoder.decode(chunk.value, { stream: true });
    }

    const split = buffer.indexOf("\n\n");
    const block = buffer.slice(0, split);

    buffer = buffer.slice(split + 2);

    return block;
  };

  const next = async (): Promise<GenUiEvent> => {
    for (;;) {
      const block = await nextBlock();
      const data = block.split("\n").find((line) => line.startsWith("data: "));

      if (data != null) {
        return JSON.parse(data.slice("data: ".length)) as GenUiEvent;
      }
    }
  };

  const close = async (): Promise<void> => {
    controller.abort();
    await reader.cancel().catch(() => undefined);
  };

  return { next, nextBlock, close };
}
