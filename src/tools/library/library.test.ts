// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { library } from "./library.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

describe("library tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches search action to library.search route by default", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { source: "live-db", dbAvailable: true, items: [] },
    });

    await library({ query: "kick", kind: "audio" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ query: "kick", kind: "audio" }),
    );
  });

  it("dispatches listTags action to library.listTags route", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { source: "live-db", dbAvailable: true, tags: [] },
    });

    await library({ action: "listTags", limit: 50 });

    expect(protocolMock.requestNode).toHaveBeenCalledWith("library.listTags", {
      limit: 50,
    });
  });

  it("returns the route's payload on success", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: {
        source: "live-db",
        dbAvailable: true,
        items: [
          {
            name: "kick.wav",
            path: "/x/kick.wav",
            kind: "audio",
            tags: [],
            useCount: 1,
            source: "user",
          },
        ],
      },
    });

    const result = await library({ query: "kick" });

    expect(result).toMatchObject({ dbAvailable: true });
  });

  it("throws with a clean message when the route returns failure", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: false,
      error: "Live database not found",
    });

    await expect(library({ query: "kick" })).rejects.toThrow(
      "library.search failed: Live database not found",
    );
  });

  it("throws with 'unknown error' when failure has no error message", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: false,
    });

    await expect(library({ query: "kick" })).rejects.toThrow(/unknown error/);
  });

  it("throws on unknown action", async () => {
    await expect(library({ action: "bogus" })).rejects.toThrow(
      "Unknown action: bogus",
    );
  });

  it("forwards all search filters to the route", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { source: "live-db", dbAvailable: true, items: [] },
    });

    await library({
      action: "search",
      query: "q",
      tags: "Kick,One Shot",
      kind: "audio",
      deviceKind: "instrument",
      source: "pack",
      sort: "name",
      limit: 7,
    });

    expect(protocolMock.requestNode).toHaveBeenCalledWith("library.search", {
      query: "q",
      tags: "Kick,One Shot",
      kind: "audio",
      deviceKind: "instrument",
      source: "pack",
      sort: "name",
      limit: 7,
    });
  });
});
