// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Imports nothing, so a `vi.mock` factory can call it while the mocked modules
// are still loading. Import it before anything that loads those modules.

/**
 * A stand-in for a module with only the exports the code under test reads.
 * Typed `never` so it fits any module's `vi.mock` factory.
 * @param exports - The exports to supply
 * @returns The same object
 */
export function partialModule(exports: object): never {
  return exports as never;
}
