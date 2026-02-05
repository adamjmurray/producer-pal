// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import "vitest";

declare module "vitest" {
  interface Assertion<T = any> {
    /**
     * Asserts that a mock function was called with a specific `this` context and arguments.
     *
     * @param expectedThis - The expected `this` context object the function should have been called with
     * @param expectedArgs - The expected arguments the function should have been called with
     * @returns The assertion result
     *
     * @example
     * ```javascript
     * const mock = { id: "test", fn: vi.fn() };
     * mock.fn("arg1", 123);
     * expect(mock.fn).toHaveBeenCalledWithThis(
     *   expect.objectContaining({ id: "test" }),
     *   "arg1",
     *   123
     * );
     * ```
     *
     * @see expect-extensions.js
     */
    toHaveBeenCalledWithThis(expectedThis: any, ...expectedArgs: any[]): T;

    /**
     * Asserts that a mock function's nth call was made with a specific `this` context and arguments.
     *
     * @param nthCall - The call number to check (1-indexed, like Vitest's toHaveBeenNthCalledWith)
     * @param expectedThis - The expected `this` context object for that call
     * @param expectedArgs - The expected arguments for that call
     * @returns The assertion result
     *
     * @example
     * ```javascript
     * const mock = { id: "test", fn: vi.fn() };
     * mock.fn("first");
     * mock.fn("second");
     * expect(mock.fn).toHaveBeenNthCalledWithThis(
     *   2,
     *   expect.objectContaining({ id: "test" }),
     *   "second"
     * );
     * ```
     *
     * @see expect-extensions.js
     */
    toHaveBeenNthCalledWithThis(
      nthCall: number,
      expectedThis: any,
      ...expectedArgs: any[]
    ): T;

    /**
     * Asserts that a mock function was called exactly once with a specific `this` context and arguments.
     *
     * @param expectedThis - The expected `this` context object the function should have been called with
     * @param expectedArgs - The expected arguments the function should have been called with
     * @returns The assertion result
     *
     * @example
     * ```javascript
     * const mock = { id: "test", fn: vi.fn() };
     * mock.fn("arg1", 123);
     * expect(mock.fn).toHaveBeenCalledExactlyOnceWithThis(
     *   expect.objectContaining({ id: "test" }),
     *   "arg1",
     *   123
     * );
     * ```
     *
     * @see expect-extensions.js
     */
    toHaveBeenCalledExactlyOnceWithThis(
      expectedThis: any,
      ...expectedArgs: any[]
    ): T;
  }
}
