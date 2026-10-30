// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type LibraryItem,
  MAX_SEARCH_LIMIT,
} from "#src/mcp-server/live-library/library-types.ts";
import { trimLibraryItems } from "../../helpers/library/library-item-trim.ts";
import { library } from "../../library.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const protocolMock =
  await import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts");

/**
 * @param overrides - Fields to change on a plain pack kick
 * @returns A full library item
 */
function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    name: "Kick 1.wav",
    path: "/Packs/Drums/One Shots/Kick 1.wav",
    kind: "audio",
    tags: ["Kick"],
    useCount: 0,
    source: "pack",
    folder: "One Shots",
    ...overrides,
  };
}

describe("trimLibraryItems", () => {
  it("drops name and folder that the path already ends with, and a zero useCount", () => {
    expect(trimLibraryItems([item()], {})).toStrictEqual([
      {
        path: "/Packs/Drums/One Shots/Kick 1.wav",
        kind: "audio",
        tags: ["Kick"],
        source: "pack",
      },
    ]);
  });

  it("keeps a useCount above zero", () => {
    expect(trimLibraryItems([item({ useCount: 3 })], {})[0]?.useCount).toBe(3);
  });

  it("drops kind and source when they equal the search's filter", () => {
    const [trimmed] = trimLibraryItems([item()], {
      kind: "audio",
      source: "pack",
    });

    expect(trimmed).not.toHaveProperty("kind");
    expect(trimmed).not.toHaveProperty("source");
  });

  it("keeps kind and source when the search filtered to others", () => {
    // kind:midi also returns MIDI Live clips, whose kind is "live-clip".
    const clip = item({ kind: "live-clip", subtype: "midi", source: "user" });
    const [trimmed] = trimLibraryItems([clip], {
      kind: "midi",
      source: "pack",
    });

    expect(trimmed).toStrictEqual({
      path: "/Packs/Drums/One Shots/Kick 1.wav",
      kind: "live-clip",
      subtype: "midi",
      tags: ["Kick"],
      source: "user",
    });
  });

  it("keeps a null kind or source even though the filter is unset", () => {
    const [trimmed] = trimLibraryItems(
      [item({ kind: null, source: null })],
      {},
    );

    expect(trimmed).toStrictEqual({
      path: "/Packs/Drums/One Shots/Kick 1.wav",
      kind: null,
      tags: ["Kick"],
      source: null,
    });
  });

  it("keeps a name with a slash in it: its path shows a colon there", () => {
    const [trimmed] = trimLibraryItems(
      [item({ name: "Kick 1/2.wav", path: "/Packs/Drums/Kick 1:2.wav" })],
      {},
    );

    expect(trimmed?.name).toBe("Kick 1/2.wav");
  });

  it("keeps a folder whose name differs from its path segment", () => {
    const [trimmed] = trimLibraryItems(
      [item({ folder: "A/B", path: "/Packs/A:B/Kick 1.wav" })],
      {},
    );

    expect(trimmed?.folder).toBe("A/B");
  });

  it("leaves a root file's missing folder missing", () => {
    const rootFile = item({ path: "/Kick 1.wav" });

    delete rootFile.folder;

    const [trimmed] = trimLibraryItems([rootFile], {});

    expect(trimmed).not.toHaveProperty("folder");
    expect(trimmed).not.toHaveProperty("name");
  });

  it("keeps the other fields, in their usual order", () => {
    const [trimmed] = trimLibraryItems(
      [
        item({
          type: "oneshot",
          pathTruncated: true,
          pathExists: false,
          useCount: 2,
        }),
      ],
      {},
    );

    expect(Object.keys(trimmed ?? {})).toStrictEqual([
      "path",
      "kind",
      "tags",
      "useCount",
      "source",
      "type",
      "pathTruncated",
      "pathExists",
    ]);
  });
});

describe("library search result items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trims what the request's own filters say", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: {
        dbAvailable: true,
        items: [
          item({ useCount: 4 }),
          item({ path: "/P/D/Kick 2.wav", name: "Kick 2.wav", folder: "D" }),
        ],
      },
    });

    const result = await library({
      query: "kick",
      kind: "audio",
      source: "pack",
    });

    expect(result).toStrictEqual({
      dbAvailable: true,
      items: [
        {
          path: "/Packs/Drums/One Shots/Kick 1.wav",
          tags: ["Kick"],
          useCount: 4,
        },
        { path: "/P/D/Kick 2.wav", tags: ["Kick"] },
      ],
    });
  });

  it("sorts on the full items before trimming them", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: {
        dbAvailable: true,
        items: [
          item({ name: "b.wav", path: "/L/b.wav", useCount: 1 }),
          item({ name: "a.wav", path: "/L/a.wav", useCount: 9 }),
        ],
      },
    });

    const result = await library({ query: "." });

    expect("items" in result && result.items.map((i) => i.path)).toStrictEqual([
      "/L/a.wav",
      "/L/b.wav",
    ]);
  });

  it("caps a huge limit at the maximum", async () => {
    const many = Array.from({ length: MAX_SEARCH_LIMIT + 50 }, (_, i) =>
      item({ name: `k${i}.wav`, path: `/L/k${i}.wav`, folder: "L" }),
    );

    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, items: many },
    });

    const result = await library({ query: "k", limit: 1001001001001001 });

    expect("items" in result && result.items).toHaveLength(200);
  });
});
