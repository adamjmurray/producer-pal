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

const NOTE =
  "12 matching files in plug-in preset folders left out; source: preset-folder includes them";

/**
 * Answer every route call with a search result, adding the note for the
 * queries named in `withNote`.
 *
 * @param withNote - Query strings whose answer carries the note
 */
function mockSearch(...withNote: string[]): void {
  vi.mocked(protocolMock.requestNode).mockImplementation(
    async (_route, routeArgs) => {
      const { query } = routeArgs as { query?: string };

      return {
        success: true,
        result: {
          dbAvailable: true,
          items: [],
          ...(withNote.includes(query ?? "") && { note: NOTE }),
        },
      };
    },
  );
}

describe("library tool: note on preset folders left out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes a search's note through", async () => {
    mockSearch("kick");

    expect(await library({ action: "search", query: "kick" })).toStrictEqual({
      dbAvailable: true,
      items: [],
      note: NOTE,
    });
  });

  it("omits the note when the search has none", async () => {
    mockSearch();

    expect(
      await library({ action: "search", query: "kick" }),
    ).not.toHaveProperty("note");
  });

  it("keeps each query's note on its own entry in a fan-out", async () => {
    mockSearch("kick");

    const result = await library({
      action: "search",
      searches: [
        { label: "Kicks", query: "kick" },
        { label: "Snares", query: "snare" },
      ],
    });

    expect(result).toStrictEqual({
      dbAvailable: true,
      results: [
        { label: "Kicks", items: [], note: NOTE },
        { label: "Snares", items: [] },
      ],
    });
  });

  it("keeps the note when a lone query answers like a plain search", async () => {
    mockSearch("kick");

    const result = await library({
      action: "search",
      searches: [{ query: "kick" }],
    });

    expect(result).toStrictEqual({ dbAvailable: true, items: [], note: NOTE });
  });

  it("passes find-similar's and find-duplicates' notes through", async () => {
    vi.mocked(protocolMock.requestNode)
      .mockResolvedValueOnce({
        success: true,
        result: {
          dbAvailable: true,
          seed: { path: "/x.wav", found: true },
          items: [],
          note: NOTE,
        },
      })
      .mockResolvedValueOnce({
        success: true,
        result: { dbAvailable: true, groups: [], note: NOTE },
      });

    const similar = await library({
      action: "find-similar",
      similarTo: "/x.wav",
    });
    const duplicates = await library({ action: "find-duplicates" });

    expect(similar).toHaveProperty("note", NOTE);
    expect(duplicates).toHaveProperty("note", NOTE);
  });
});
