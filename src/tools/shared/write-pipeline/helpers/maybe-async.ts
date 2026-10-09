// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type MaybePromise } from "../write-pipeline-types.ts";

/**
 * Run `next` on a value that may still be coming, staying sync when it isn't.
 * A call whose hooks are all sync never becomes async, which is what lets a
 * tool without an awaited step keep its sync API.
 * @param value - A value, or a promise of one
 * @param next - What to do with it
 * @returns `next`'s result, as a promise only if `value` was one
 */
export function afterMaybe<T, R>(
  value: MaybePromise<T>,
  next: (resolved: T) => MaybePromise<R>,
): MaybePromise<R> {
  return value instanceof Promise ? value.then(next) : next(value);
}
