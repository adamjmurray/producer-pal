// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockNonExistentObjects } from "#src/test/mocks/mock-registry.ts";
import { applyCodeToSingleClip } from "../apply-code-to-clip.ts";

vi.mock(import("#src/live-api-adapter/code-exec-v8-protocol.ts"), () => ({
  executeNoteCode: vi.fn(),
}));

describe("applyCodeToSingleClip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when clip does not exist", async () => {
    mockNonExistentObjects();

    const result = await applyCodeToSingleClip("nonexistent-clip", "return []");

    expect(result).toBeNull();
  });
});
