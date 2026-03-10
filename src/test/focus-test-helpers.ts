// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, type vi } from "vitest";

/**
 * Set up a select() mock for focus functionality tests.
 * Registers a beforeEach hook that imports the mocked select function and clears it.
 *
 * The caller must have `vi.mock(import("#src/tools/control/select.ts"), ...)`
 * at the top level of their test file (vi.mock is hoisted by Vitest).
 * @returns Object with a getter for the select mock (populated after beforeEach runs)
 */
export function setupSelectMock(): {
  get: () => ReturnType<typeof vi.fn>;
} {
  let selectMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const selectModule = await import("#src/tools/control/select.ts");

    selectMock = selectModule.select as ReturnType<typeof vi.fn>;
    selectMock.mockClear();
  });

  return {
    get: () => selectMock,
  };
}
