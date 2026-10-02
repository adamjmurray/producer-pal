// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";

// The warp marker params are a work-in-progress, gated on ENABLE_WARP_MARKERS
// so no release build publishes them. The schema is built at module load, so
// the build's flag decides the shape — reimport under each one.
describe("update-clip warp marker params", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ["publishes them in a debug build", "true", true],
    ["leaves them out of a release build", undefined, false],
  ])("%s", async (_label, flag, published) => {
    vi.stubEnv("ENABLE_WARP_MARKERS", flag);
    vi.resetModules();

    const { toolDefUpdateClip } =
      await import("#src/tools/clip/update/update-clip.def.ts");
    const params = Object.keys(toolDefUpdateClip.toolOptions.inputSchema);

    for (const name of [
      "warpOp",
      "warpBeatTime",
      "warpSampleTime",
      "warpDistance",
    ]) {
      expect(params.includes(name)).toBe(published);
    }
  });
});
