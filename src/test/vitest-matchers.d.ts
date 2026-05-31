// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import "vitest";

declare module "vitest" {
  interface Assertion<T = unknown> {
    /**
     * Check the length property (overload for duration format strings).
     * Used for clip length assertions like "1bar" (1 bar, 0 beats).
     */
    toHaveLength(expected: number | string): T;
  }
}
