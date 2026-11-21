// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

export interface StreamInterrupt {
  /** Give this to streamText: aborts on the caller's Stop or on `stop()`. */
  signal: AbortSignal;
  /** Stop this one stream without touching the caller's signal. */
  stop: () => void;
  /** Stop listening to the caller's signal. Call when the stream is done. */
  release: () => void;
}

/**
 * Make an abort signal for one stream, so the stream can be stopped on its own.
 * It also aborts when the caller's signal does.
 * @param callerSignal - The caller's Stop signal, if any
 * @returns The stream's signal, with a way to stop it and to release it
 */
export function createStreamInterrupt(
  callerSignal?: AbortSignal,
): StreamInterrupt {
  const controller = new AbortController();

  const onCallerAbort = (): void => {
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal?.aborted) {
    onCallerAbort();
  } else {
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  }

  return {
    signal: controller.signal,
    stop: () => {
      controller.abort();
    },
    release: () => {
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}
