// Shared vi.mock setup for all duplicate tests.
// Import this file at the top of each test file to set up the mocks.
import { vi } from "vitest";

// @ts-expect-error Vitest mock types are overly strict for partial mocks
vi.mock(import("#src/tools/clip/update/update-clip.js"), async () => {
  const s = await import("./setup.js");

  return { updateClip: s.updateClipMock };
});
// @ts-expect-error: Mock returns simplified types that don't match full signature
vi.mock(
  import("#src/tools/shared/arrangement/arrangement-tiling.js"),
  async () => {
    const s = await import("./setup.js");

    return {
      createShortenedClipInHolding: s.createShortenedClipInHoldingMock,
      moveClipFromHolding: s.moveClipFromHoldingMock,
    };
  },
);
