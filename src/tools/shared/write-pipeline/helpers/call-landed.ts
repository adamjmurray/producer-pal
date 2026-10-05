// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { landedDetail } from "../landed-detail.ts";
import { type MaybePromise } from "../write-pipeline-types.ts";

/** What the call as a whole has changed, and how to say so when it throws. */
export interface CallJournal {
  /** `call.landed`: note one thing the call changed */
  landed: (phrase: string) => void;
  /**
   * Run a whole-call hook. A throw from it, sync or async, says what the
   * journal holds; with nothing in it, the throw passes through unchanged.
   * @param hook - The hook to run
   * @returns What the hook returned, as a promise only if it was one
   */
  guard: <T>(hook: () => MaybePromise<T>) => MaybePromise<T>;
}

/**
 * A fresh journal for one call.
 * @returns The journal
 */
export function callJournal(): CallJournal {
  const phrases: string[] = [];

  const rethrow = (error: unknown): never => {
    if (phrases.length === 0) {
      throw error;
    }

    throw new Error(landedDetail(errorMessage(error), phrases), {
      cause: error,
    });
  };

  return {
    landed: (phrase) => {
      if (!phrases.includes(phrase)) {
        phrases.push(phrase);
      }
    },
    guard: (hook) => {
      try {
        const result = hook();

        return result instanceof Promise ? result.catch(rethrow) : result;
      } catch (error) {
        return rethrow(error);
      }
    },
  };
}
