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
vi.mock(
  import("#src/tools/shared/arrangement/arrangement-tiling-holding.ts"),
  // @ts-expect-error: Mock returns simplified types that don't match full signature
  async () => {
    const s = await import("./setup.ts");

    return {
      createShortenedClipInHolding: s.createShortenedClipInHoldingMock,
    };
  },
);
vi.mock(
  import("#src/tools/shared/arrangement/arrangement-tiling-workaround.ts"),
  // @ts-expect-error: Mock returns simplified types that don't match full signature
  async (importOriginal) => {
    const s = await import("./setup.ts");

    return {
      // Keep the real holdingAreaStartPast: it is pure arithmetic on the
      // holding-area start, and stubbing it would hide where callers place it.
      ...(await importOriginal()),
      clearClipAtDuplicateTarget: s.clearClipAtDuplicateTargetMock,
      duplicateSelfOverlappingClip: s.duplicateSelfOverlappingClipMock,
      moveClipFromHolding: s.moveClipFromHoldingMock,
    };
  },
);
