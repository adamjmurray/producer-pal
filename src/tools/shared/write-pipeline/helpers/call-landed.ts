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
  /** @returns Whether anything has been noted as landed */
  touched: () => boolean;
  /**
   * Run a whole-call hook. A throw from it, sync or async, says what the
   * journal holds; with nothing in it, the throw passes through unchanged.
   * With `recover`, a throw is handed to it instead of rethrown.
   * @param hook - The hook to run
   * @param recover - Takes the throw's message, plus what landed, and answers
   *   for the hook
   * @returns What the hook (or `recover`) returned, as a promise only if the
   *   hook returned one
   */
  guard: <T>(
    hook: () => MaybePromise<T>,
    recover?: (detail: string) => T,
  ) => MaybePromise<T>;
}

/**
 * A fresh journal for one call.
 * @returns The journal
 */
export function callJournal(): CallJournal {
  const phrases: string[] = [];

  const detailOf = (error: unknown): string =>
    phrases.length === 0
      ? errorMessage(error)
      : landedDetail(errorMessage(error), phrases);

  const rethrow = (error: unknown): never => {
    if (phrases.length === 0) {
      throw error;
    }

    throw new Error(detailOf(error), { cause: error });
  };

  return {
    landed: (phrase) => {
      if (!phrases.includes(phrase)) {
        phrases.push(phrase);
      }
    },
    touched: () => phrases.length > 0,
    guard: <T>(
      hook: () => MaybePromise<T>,
      recover?: (detail: string) => T,
    ): MaybePromise<T> => {
      const fail = (error: unknown): T =>
        recover == null ? rethrow(error) : recover(detailOf(error));

      try {
        const result = hook();

        return result instanceof Promise ? result.catch(fail) : result;
      } catch (error) {
        return fail(error);
      }
    },
  };
}
