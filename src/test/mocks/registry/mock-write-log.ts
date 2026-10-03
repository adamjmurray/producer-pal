// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Mock } from "vitest";

/** One `set` or `call` made on any mock LiveAPI object. */
export interface MockWrite {
  kind: "set" | "call";
  /** The target's bare id, as it was when the write happened */
  id: string;
  /** The target's path, as it was when the write happened */
  path: string;
  /** The property (set) or method (call) */
  name: string;
  /** Everything after the name */
  args: unknown[];
}

const log: MockWrite[] = [];

/**
 * Wrap a set/call mock so every invocation lands in the write log.
 *
 * A Proxy rather than a mock implementation, because tests replace the
 * implementation (`mockImplementation`) and that would drop the logging.
 * @param spy - The vi.fn() behind `set` or `call`
 * @param kind - Which of the two it is
 * @param target - Reads the target's id and path when the call happens
 * @returns The same mock, logging as it goes
 */
export function logMockWrites(
  spy: Mock,
  kind: MockWrite["kind"],
  target: () => { id: string; path: string },
): Mock {
  return new Proxy(spy, {
    apply(fn, thisArg, callArgs: unknown[]) {
      const [name, ...args] = callArgs;

      log.push({ kind, ...target(), name: String(name), args });

      return Reflect.apply(fn, thisArg, callArgs) as unknown;
    },
  });
}

/**
 * Every `set` and `call` since the last clear, in order — on registered and
 * unregistered objects alike. Includes read-only calls such as
 * `get_version_string`; filter them out when asserting "nothing was written".
 * @returns A copy of the log
 */
export function getMockWrites(): MockWrite[] {
  return [...log];
}

/** Empty the write log. Called in beforeEach; tests may call it mid-test. */
export function clearMockWrites(): void {
  log.length = 0;
}
