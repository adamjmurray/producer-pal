// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { createdCount } from "#src/tools/shared/helpers/created-range.ts";

/**
 * A failed target's reason, naming the rack chains made for it. Nothing made
 * is undone, so they stay in the Set empty, and the caller has to be told.
 * @param reason - Why the target failed
 * @param made - The chain ranges made ("c1-c3, c0"), if any
 * @returns The reason, with the chains appended when there are any
 */
export function withChainsLeft(
  reason: string,
  made: string | undefined,
): string {
  if (made == null || made === "") {
    return reason;
  }

  const count = createdCount(made.split(", "));
  const noun = count === 1 ? "an empty chain" : `${count} empty chains`;

  return `${reason}; left ${noun}: ${made}`;
}

/**
 * The error to throw for a failure after chains were made on the way.
 * @param error - What was thrown
 * @param made - The chain ranges made, if any
 * @returns The error, naming the chains when any were made
 */
export function errorWithChainsLeft(
  error: unknown,
  made: string | undefined,
): Error {
  if (made == null || made === "") {
    return error instanceof Error ? error : new Error(String(error));
  }

  return new Error(withChainsLeft(errorMessage(error), made), {
    cause: error,
  });
}
