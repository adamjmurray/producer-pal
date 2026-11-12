// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type LibraryToolSearchResult } from "#src/mcp-server/live-library/library-types.ts";
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

// A filter that matches every file these tests make, since a search with no
// query or filter is refused.
const ANY = { query: ".wav" };

/**
 * Narrow a library result to the search shape the tests read from.
 * @param result - What the library tool returned
 */
function assertItems(
  result: Awaited<ReturnType<typeof library>>,
): asserts result is LibraryToolSearchResult {
  if (!("items" in result)) {
    throw new Error("expected items");
  }
}

/**
 * The file names of a result's items, read off their paths (the items carry no
 * `name`).
 * @param result - A search result
 * @returns Each item's file name, in order
 */
function leaves(result: LibraryToolSearchResult): Array<string | undefined> {
  return result.items.map((i) => i.path.split("/").at(-1));
}

/**
 * Stub the library.search route with the given items.
 *
 * @param items - Items the route should return
 */
function mockSearchRoute(items: unknown[]): void {
  vi.mocked(protocolMock.requestNode).mockResolvedValue({
    success: true,
    result: { dbAvailable: true, items },
  });
}

/**
 * Build a minimal DB library item with the given name and useCount.
 *
 * @param name - Item name (also its leaf path)
 * @param useCount - Usage count driving the default (use-count desc) sort
 * @returns A LibraryItem-shaped object sourced from the DB ("user")
 */
function dbItem(name: string, useCount: number): Record<string, unknown> {
  return {
    name,
    path: `/L/${name}`,
    kind: "audio",
    tags: [],
    useCount,
    source: "user",
  };
}

/**
 * Stub the search route with three DB items whose name order, useCount order,
 * and upstream (array) order all differ, so each sort mode yields a distinct
 * sequence. This is what pins sortItems: with coincidentally-aligned data
 * a wrong sort branch produces the same output and survives mutation.
 *
 *   upstream: b(1), a(3), c(2)
 *   name:     a, b, c
 *   use-count desc (default): a(3), c(2), b(1)
 *   mod_date (DB upstream order preserved): b, a, c
 */
function mockDiscriminatingSortRoute(): void {
  mockSearchRoute([dbItem("b.wav", 1), dbItem("a.wav", 3), dbItem("c.wav", 2)]);
}

describe("library tool — action dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the running Live version with every route call", async () => {
    // Node has no Live API, so it can only scope its database lookup to the
    // running major if V8 hands it the version.
    registerMockObject("live_app", {
      path: "live_app",
      methods: { get_version_string: () => "12.4" },
    });
    mockSearchRoute([]);

    await library({ query: "kick" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ liveVersion: "12.4" }),
    );
  });

  it("dispatches search action to library.search route by default", async () => {
    mockSearchRoute([]);

    await library({ query: "kick", kind: "audio" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ query: "kick", kind: "audio" }),
    );
  });

  it("passes inFolder through to the library.search route", async () => {
    mockSearchRoute([]);

    await library({ inFolder: "/some/folder" });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ inFolder: "/some/folder" }),
    );
  });

  it("passes verifyPaths through to the library.search route", async () => {
    mockSearchRoute([]);

    await library({ query: "kick", verifyPaths: true });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ verifyPaths: true }),
    );
  });

  it("propagates the staleness note from the search route", async () => {
    const stalenessNote = "snapshot may be out of date";

    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, stalenessNote, items: [] },
    });

    const result = await library({ query: "kick" });

    assertItems(result);

    expect(result.stalenessNote).toBe(stalenessNote);
  });

  it("dispatches list-tags action to library.listTags route", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, tags: [] },
    });

    await library({ action: "list-tags", limit: 50 });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.listTags",
      expect.objectContaining({ limit: 50 }),
    );
  });

  it("dispatches list-categories action, forwarding category + limit", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, category: "Drums", tags: [] },
    });

    await library({ action: "list-categories", category: "Drums", limit: 5 });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.listCategories",
      expect.objectContaining({ category: "Drums", limit: 5 }),
    );
  });

  it("throws with a clean message when the route returns failure", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: false,
      error: "Live database not found",
    });

    await expect(library({ query: "kick" })).rejects.toThrow(
      "Live database not found",
    );
  });

  it("throws with 'unknown error' when failure has no message", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({ success: false });

    await expect(library({ query: "kick" })).rejects.toThrow(/unknown error/);
  });

  it("throws on unknown action", async () => {
    await expect(library({ action: "bogus" })).rejects.toThrow(
      "Unknown action: bogus",
    );
  });

  it("throws when a route reports success but omits the result payload", async () => {
    // callRoute guards on `!success || !result`: a truthy success with a
    // missing result must still throw, not resolve to an undefined payload.
    vi.mocked(protocolMock.requestNode).mockResolvedValue({ success: true });

    await expect(library({ action: "list-tags" })).rejects.toThrow(
      "unknown error",
    );
  });
});

describe("library tool — search results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the route's items and dbAvailable", async () => {
    mockSearchRoute([dbItem("clap.wav", 7)]);

    const result = await library(ANY);

    assertItems(result);

    expect(result.dbAvailable).toBe(true);
    expect(leaves(result)).toStrictEqual(["clap.wav"]);
    // No cause to report, so the key is omitted rather than undefined.
    expect("detail" in result).toBe(false);
  });

  it("passes the DB's reason through", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: {
        dbAvailable: false,
        items: [],
        detail: "Live database not found",
      },
    });

    const result = await library(ANY);

    assertItems(result);

    expect(result.dbAvailable).toBe(false);
    expect(result.detail).toBe("Live database not found");
  });

  it("limit=0 falls back to the default cap rather than an empty page", async () => {
    mockSearchRoute([]);

    await library({ ...ANY, limit: 0 });

    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ limit: 50 }),
    );
  });

  it("leaves a result's name and folder off when its path says them", async () => {
    mockSearchRoute([{ ...dbItem("snare.wav", 0), folder: "L" }]);

    const result = await library(ANY);

    assertItems(result);

    expect(result.items[0]).not.toHaveProperty("name");
    expect(result.items[0]).not.toHaveProperty("folder");
  });
});

describe("library tool — sort ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("default sort orders by use-count desc (name tiebreak)", async () => {
    mockDiscriminatingSortRoute();

    const result = await library(ANY);

    assertItems(result);

    expect(leaves(result)).toStrictEqual([
      "a.wav", // useCount 3
      "c.wav", // useCount 2
      "b.wav", // useCount 1
    ]);
  });

  it("sort=name orders alphabetically, ignoring use_count", async () => {
    mockDiscriminatingSortRoute();

    const result = await library({ ...ANY, sort: "name" });

    assertItems(result);

    expect(leaves(result)).toStrictEqual(["a.wav", "b.wav", "c.wav"]);
  });

  it("sort=mod_date preserves the DB's upstream order", async () => {
    mockDiscriminatingSortRoute();

    const result = await library({ ...ANY, sort: "mod-date" });

    assertItems(result);

    // mod_date keeps the upstream (SQL-provided) order rather than re-sorting
    // by name or use_count.
    expect(leaves(result)).toStrictEqual(["b.wav", "a.wav", "c.wav"]);
  });
});
