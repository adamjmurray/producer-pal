// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Wrap an async iterable so that an external error signal can break the
 * iteration. This is needed because browser CORS and network errors inside the
 * AI SDK's TransformStream can hang the async iterator forever instead of
 * throwing. The AI SDK's `onError` callback fires in these cases, so we use it
 * to reject a racing promise and unblock the hung iterator.
 * @param stream - The source async iterable
 * @param onStreamError - Called with a reject function that triggers immediate error
 * @yields Values from the source stream
 */
export async function* streamWithErrorSignal<T>(
  stream: AsyncIterable<T>,
  onStreamError: (reject: (error: unknown) => void) => void,
): AsyncGenerator<T> {
  const iterator = stream[Symbol.asyncIterator]();
  let errorReject: ((error: unknown) => void) | undefined;

  const errorPromise = new Promise<never>((_, reject) => {
    errorReject = reject;
    onStreamError(reject);
  });

  try {
    while (true) {
      const result = await Promise.race([iterator.next(), errorPromise]);

      if (result.done) return;

      yield result.value;
    }
  } finally {
    // Suppress unhandled rejection and clean up the error promise
    errorPromise.catch(() => {});
    errorReject?.(new Error("cleanup"));

    await iterator.return?.();
  }
}
