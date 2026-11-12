// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
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

const DB_NAMES = ["a.wav", "b.wav", "c.wav", "d.wav", "e.wav"];

/**
 * @param name - File name, or an absolute path
 * @returns A DB item; a bare name sits in /L
 */
function dbItem(name: string): Record<string, unknown> {
  return {
    name: name.split("/").at(-1),
    path: name.startsWith("/") ? name : `/L/${name}`,
    kind: "audio",
    tags: [],
    useCount: 0,
    source: "user",
  };
}

/**
 * Stub library.search as a DB holding the given items, honoring offset and
 * limit and reporting how many rows follow its window, as the real route does.
 * @param names - The matching files, in the order the DB returns them; a name
 *   starting with "/" is a full path
 */
function mockDb(names: string[] = DB_NAMES): void {
  const rows = names.map((name) => dbItem(name));

  vi.mocked(protocolMock.requestNode).mockImplementation(
    async (_route, routeArgs) => {
      const { offset = 0, limit } = routeArgs as {
        offset?: number;
        limit: number;
      };
      const items = rows.slice(offset, offset + limit);
      const left = rows.length - offset - items.length;

      return {
        success: true,
        result: { dbAvailable: true, items, ...(left > 0 && { more: left }) },
      };
    },
  );
}

/**
 * Run a plain search and narrow the result to the search shape.
 * @param args - Search args (a query is added)
 * @returns Item file names, plus the paging fields
 */
async function search(args: Parameters<typeof library>[0]) {
  const result = await library({ query: "wav", ...args });

  if (!("items" in result)) {
    throw new Error("expected items");
  }

  return {
    names: result.items.map((i) => i.path.split("/").at(-1)),
    result,
  };
}

describe("library search paging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("says how many matches follow a page that hit the limit", async () => {
    mockDb();

    const { names, result } = await search({ limit: 2 });

    expect(names).toStrictEqual(["a.wav", "b.wav"]);
    expect(result).toStrictEqual(
      expect.objectContaining({ more: 3, nextOffset: 2 }),
    );
  });

  it("reads a second page from the offset", async () => {
    mockDb();

    const { names, result } = await search({ limit: 2, offset: 2 });

    expect(names).toStrictEqual(["c.wav", "d.wav"]);
    expect(result).toStrictEqual(
      expect.objectContaining({ more: 1, nextOffset: 4 }),
    );
    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.objectContaining({ offset: 2, limit: 2 }),
    );
  });

  it("leaves the marker off the last page", async () => {
    mockDb();

    const { names, result } = await search({ limit: 2, offset: 4 });

    expect(names).toStrictEqual(["e.wav"]);
    expect(result).not.toHaveProperty("more");
    expect(result).not.toHaveProperty("nextOffset");
  });

  it("leaves the marker off a search that fits its limit exactly", async () => {
    mockDb();

    const { names, result } = await search({ limit: 5 });

    expect(names).toHaveLength(5);
    expect(result).not.toHaveProperty("more");
    expect(result).not.toHaveProperty("nextOffset");
  });

  it("starts at the first match for an offset that is negative or not a number", async () => {
    mockDb();

    const first = await search({ limit: 2, offset: -3 });
    const second = await search({ limit: 2, offset: Number.NaN });

    expect(first.names).toStrictEqual(["a.wav", "b.wav"]);
    expect(second.names).toStrictEqual(["a.wav", "b.wav"]);
  });

  it("says so when the offset is past the last match", async () => {
    mockDb();

    const { names, result } = await search({ limit: 2, offset: 9 });

    expect(names).toStrictEqual([]);
    expect(result).toStrictEqual(
      expect.objectContaining({ detail: "offset 9 is past the last match" }),
    );
    expect(result).not.toHaveProperty("more");
  });

  it("gives an empty first page no detail", async () => {
    mockDb([]);

    const { result } = await search({ limit: 2 });

    expect(result).not.toHaveProperty("detail");
  });

  describe("in a searches entry", () => {
    it("pages each entry on its own", async () => {
      mockDb();

      const result = await library({
        searches: [
          { label: "Page 1", query: "wav", limit: 2 },
          { label: "Page 2", query: "wav", limit: 2, offset: 2 },
          { label: "Last", query: "wav", limit: 2, offset: 4 },
        ],
      });

      if (!("results" in result)) {
        throw new Error("expected results");
      }

      const [first, second, last] = result.results;

      expect(first).toStrictEqual(
        expect.objectContaining({ more: 3, nextOffset: 2 }),
      );
      expect(second).toStrictEqual(
        expect.objectContaining({ more: 1, nextOffset: 4 }),
      );
      expect(
        second?.items.map((item) => item.path.split("/").at(-1)),
      ).toStrictEqual(["c.wav", "d.wav"]);
      expect(last).not.toHaveProperty("more");
      expect(last).not.toHaveProperty("nextOffset");
    });

    it("keeps the paging fields on a lone entry's plain answer", async () => {
      mockDb();

      const result = await library({
        searches: [{ query: "wav", limit: 2, offset: 1 }],
      });

      expect(result).not.toHaveProperty("results");
      expect(result).toStrictEqual(
        expect.objectContaining({ more: 2, nextOffset: 3 }),
      );
    });
  });

  describe("refusals", () => {
    it("refuses offset on an action that doesn't page", async () => {
      await expect(library({ action: "list-tags", offset: 5 })).rejects.toThrow(
        /offset/,
      );
    });

    it("refuses offset beside searches", async () => {
      await expect(
        library({ offset: 5, searches: [{ query: "wav" }] }),
      ).rejects.toThrow(/offset can't be sent beside searches/);
    });

    it("doesn't count an offset as a filter", async () => {
      await expect(library({ offset: 5 })).rejects.toThrow(
        /search needs a query or a filter/,
      );
    });
  });
});
