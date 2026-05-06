// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Create an error signal that can break a hung async iterator.
 *
 * This is needed because browser CORS and network errors inside the AI SDK's
 * TransformStream can hang the fullStream async iterator forever instead of
 * throwing. The AI SDK's `onError` callback fires in these cases — call
 * `signal.reject(error)` from it to unblock the iterator.
 * @returns Object with `reject` function and `wrapStream` to apply to an async iterable
 */
export function createStreamErrorSignal(): {
  onError: (event: { error: unknown }) => void;
  wrapStream: <T>(stream: AsyncIterable<T>) => AsyncGenerator<T>;
} {
  let rejectFn: (error: unknown) => void;

  const errorPromise = new Promise<never>((_, reject) => {
    rejectFn = reject;
  });

  // Suppress unhandled rejection — the promise may never be rejected if the
  // stream completes normally, or may be rejected after we stop racing it.
  errorPromise.catch(() => {});

  return {
    onError: ({ error }: { error: unknown }) => rejectFn(error),

    async *wrapStream<T>(stream: AsyncIterable<T>): AsyncGenerator<T> {
      const iterator = stream[Symbol.asyncIterator]();

      try {
        while (true) {
          const result = await Promise.race([iterator.next(), errorPromise]);

          if (result.done) return;

          yield result.value;
        }
      } finally {
        await iterator.return?.();
      }
    },
  };
}
