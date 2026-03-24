// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared vi.mock setup for all duplicate tests.
// Import this file at the top of each test file to set up the mocks.
import { vi } from "vitest";

// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("#src/tools/clip/update/update-clip.ts"), async () => {
  const s = await import("./setup.ts");

  return { updateClip: s.updateClipMock };
});
// @ts-expect-error: Mock returns simplified types that don't match full signature
vi.mock(
  import("#src/tools/shared/arrangement/arrangement-tiling-holding.ts"),
  async () => {
    const s = await import("./setup.ts");

    return {
      createShortenedClipInHolding: s.createShortenedClipInHoldingMock,
    };
  },
);
// @ts-expect-error: Mock returns simplified types that don't match full signature
vi.mock(
  import("#src/tools/shared/arrangement/arrangement-tiling-workaround.ts"),
  async () => {
    const s = await import("./setup.ts");

    return {
      clearClipAtDuplicateTarget: vi.fn(),
      moveClipFromHolding: s.moveClipFromHoldingMock,
    };
  },
);
