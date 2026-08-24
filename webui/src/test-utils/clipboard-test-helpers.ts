// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, vi } from "vitest";

/**
 * Stub `navigator.clipboard.writeText`, re-stubbed before each test. Register at
 * the scope the stub should live in (module or describe); the returned mock is
 * reset, not reassigned, so callers can capture it once.
 * @returns The writeText mock
 */
export function installClipboardMock(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  return writeText;
}
