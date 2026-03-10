// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, vi } from "vitest";

/**
 * Set up a select() mock for focus functionality tests.
 * Registers a beforeEach hook that imports the mocked select function and clears it.
 *
 * If the select module is not already mocked at the top level of the test file,
 * pass `{ mock: true }` to register the mock inside beforeEach.
 * @param options - Configuration options
 * @param options.mock - Whether to register vi.mock for the select module (default: false)
 * @returns Object with a getter for the select mock (populated after beforeEach runs)
 */
export function setupSelectMock(options: { mock?: boolean } = {}): {
  get: () => ReturnType<typeof vi.fn>;
} {
  let selectMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    if (options.mock) {
      vi.mock(import("#src/tools/control/select.ts"), () => ({
        select: vi.fn(),
      }));
    }

    const selectModule = await import("#src/tools/control/select.ts");

    selectMock = selectModule.select as ReturnType<typeof vi.fn>;
    selectMock.mockClear();
  });

  return {
    get: () => selectMock,
  };
}
