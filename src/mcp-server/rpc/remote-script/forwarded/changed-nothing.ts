// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// V8 says on a response when the call provably changed nothing in the Set.
// Node keeps that as a symbol on the result, which no JSON.stringify or
// schema check on the way out to the client will ever see.

const CHANGED_NOTHING = Symbol("changedNothing");

/**
 * Note that V8 proved a response's call changed nothing.
 * @param response - The response, marked in place
 */
export function markChangedNothing(response: object): void {
  Object.defineProperty(response, CHANGED_NOTHING, { value: true });
}

/**
 * @param response - A tool response
 * @returns True when V8 proved its call changed nothing in the Set; false when
 *   it said nothing, which includes any response Node made itself (a timeout)
 */
export function isChangedNothing(response: object): boolean {
  return (response as Record<symbol, unknown>)[CHANGED_NOTHING] === true;
}
