// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { streamWithErrorSignal } from "#webui/chat/sdk/stream-with-error-signal";

/**
 * Create an async iterable that yields values immediately.
 * @param values - Values to yield
 * @yields Each value from the array
 */
async function* immediateStream<T>(values: T[]): AsyncGenerator<T> {
  for (const value of values) {
    yield value;
  }
}

/**
 * Create an async iterable whose next() hangs forever after initial values.
 * Uses a manual iterator (not a generator) so return() can complete cleanly.
 * @param initialValues - Values to yield before hanging
 * @returns Async iterable that hangs after yielding initial values
 */
function hangingStream<T>(initialValues: T[] = []): AsyncIterable<T> {
  let index = 0;

  return {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (index < initialValues.length) {
            return Promise.resolve({
              value: initialValues[index++] as T,
              done: false,
            });
          }

          return new Promise(() => {}); // Hang forever
        },
        return(): Promise<IteratorResult<T>> {
          return Promise.resolve({ value: undefined as T, done: true });
        },
      };
    },
  };
}

/**
 * Collect values from an async iterable into an array.
 * @param stream - Async iterable to consume
 * @returns Array of yielded values
 */
async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];

  for await (const v of stream) values.push(v);

  return values;
}

/** No-op error signal handler for tests that don't need it. */
const noopSignal = () => {};

describe("streamWithErrorSignal", () => {
  it("yields all values from a normal stream", async () => {
    const values = await collect(
      streamWithErrorSignal(immediateStream([1, 2, 3]), noopSignal),
    );

    expect(values).toStrictEqual([1, 2, 3]);
  });

  it("propagates errors from the source stream", async () => {
    // eslint-disable-next-line require-yield -- intentionally throws before yielding
    async function* errorStream(): AsyncGenerator<number> {
      throw new Error("stream broke");
    }

    await expect(
      collect(streamWithErrorSignal(errorStream(), noopSignal)),
    ).rejects.toThrow("stream broke");
  });

  it("rejects immediately via error signal", async () => {
    let triggerError!: (error: unknown) => void;

    const promise = collect(
      streamWithErrorSignal(hangingStream<number>(), (reject) => {
        triggerError = reject;
      }),
    );

    triggerError(new Error("CORS network error"));

    await expect(promise).rejects.toThrow("CORS network error");
  });

  it("rejects mid-stream via error signal", async () => {
    let triggerError!: (error: unknown) => void;

    const promise = collect(
      streamWithErrorSignal(hangingStream([1, 2]), (reject) => {
        triggerError = reject;
      }),
    );

    triggerError(new Error("connection lost"));

    await expect(promise).rejects.toThrow("connection lost");
  });
});
