// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import "vitest";

declare module "vitest" {
  interface Assertion<T = unknown> {
    /** Assert mock was called with specific this context and args */
    toHaveBeenCalledWithThis(
      expectedThis: unknown,
      ...expectedArgs: unknown[]
    ): T;
    /** Assert mock's nth call had specific this context and args */
    toHaveBeenNthCalledWithThis(
      nthCall: number,
      expectedThis: unknown,
      ...expectedArgs: unknown[]
    ): T;
    /** Assert mock was called exactly once with specific this context and args */
    toHaveBeenCalledExactlyOnceWithThis(
      expectedThis: unknown,
      ...expectedArgs: unknown[]
    ): T;
    /**
     * Check the length property (overload for bar:beat format strings).
     * Used for clip length assertions like "1:0" (1 bar, 0 beats).
     */
    toHaveLength(expected: number | string): T;
  }
}
