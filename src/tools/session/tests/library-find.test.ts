// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { library } from "../library.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

describe("library tool — findSimilar / findDuplicates dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes findSimilar to library.findSimilar with the seed plus candidate filters", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: {
        dbAvailable: true,
        seed: { path: "/x/kick.wav", found: true },
        items: [],
      },
    });

    const result = await library({
      action: "findSimilar",
      similarTo: "/x/kick.wav",
      tags: "Kick",
      limit: 5,
    });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.findSimilar",
      expect.objectContaining({
        similarTo: "/x/kick.wav",
        tags: "Kick",
        limit: 5,
      }),
    );
    expect("seed" in result).toBe(true);
  });

  it("routes findDuplicates to library.findDuplicates with candidate filters", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, groups: [] },
    });

    const result = await library({
      action: "findDuplicates",
      inFolder: "/Drums",
      source: "user",
    });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.findDuplicates",
      expect.objectContaining({ inFolder: "/Drums", source: "user" }),
    );
    // findDuplicates takes no seed, so similarTo must not be forwarded.
    expect(protocolMock.requestNode).not.toHaveBeenCalledWith(
      "library.findDuplicates",
      expect.objectContaining({ similarTo: expect.anything() }),
    );
    expect("groups" in result).toBe(true);
  });
});
