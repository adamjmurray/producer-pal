// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { recordWriteRun } from "#src/shared/max/v8-warning-capture.ts";
import { type MaybePromise } from "../write-pipeline-types.ts";

/**
 * Whether a run provably changed nothing in the Set. Starts false: only a path
 * that knows nothing was written says otherwise, so an unforeseen exit counts
 * as a change.
 */
export interface WriteVerdict {
  unchanged: boolean;
}

/**
 * Run a write and report its verdict against the request in flight, whichever
 * way it ends. Stays sync when `run` does.
 * @param verdict - What the run sets as it learns more
 * @param run - The write
 * @returns What `run` returned, rethrowing what it threw
 */
export function reportingVerdict<T>(
  verdict: WriteVerdict,
  run: () => MaybePromise<T>,
): MaybePromise<T> {
  const report = (): void => recordWriteRun(verdict.unchanged);
  let result: MaybePromise<T>;

  try {
    result = run();
  } catch (error) {
    report();
    throw error;
  }

  if (!(result instanceof Promise)) {
    report();

    return result;
  }

  return result.then(
    (value) => {
      report();

      return value;
    },
    (error: unknown) => {
      report();
      throw error;
    },
  );
}

/**
 * Run a stage that refuses a call before anything is written. A throw from it
 * means nothing changed.
 * @param verdict - The run's verdict
 * @param stage - The stage; may return a promise
 * @returns What `stage` returned, rethrowing what it threw
 */
export function refusingUpFront<T>(
  verdict: WriteVerdict,
  stage: () => MaybePromise<T>,
): MaybePromise<T> {
  const refused = (error: unknown): never => {
    verdict.unchanged = true;
    throw error;
  };

  try {
    const result = stage();

    return result instanceof Promise ? result.catch(refused) : result;
  } catch (error) {
    return refused(error);
  }
}
