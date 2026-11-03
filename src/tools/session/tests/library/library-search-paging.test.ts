// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockFolderStructure } from "#src/test/mocks/mock-folder.ts";
import { createWavEntries } from "../samples-test-helpers.ts";
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
 * @param name - File name
 * @returns A DB item whose path is /L/<name>
 */
function dbItem(name: string): Record<string, unknown> {
  return {
    name,
    path: `/L/${name}`,
    kind: "audio",
    tags: [],
    useCount: 0,
    source: "user",
  };
}

/**
 * Stub library.search as a DB holding the given items: it honors offset and
 * limit and reports how many rows follow its window, as the real route does.
 * @param names - The matching files, in the order the DB returns them
 */
function mockDb(
  names: string[] = DB_NAMES,
  useCounts: Record<string, number> = {},
): void {
  vi.mocked(protocolMock.requestNode).mockImplementation(
    async (_route, routeArgs) => {
      const { offset = 0, limit } = routeArgs as {
        offset?: number;
        limit: number;
      };
      const items = names
        .slice(offset, offset + limit)
        .map((name) => ({ ...dbItem(name), useCount: useCounts[name] ?? 0 }));
      const left = names.length - offset - items.length;

      return {
        success: true,
        result: { dbAvailable: true, items, ...(left > 0 && { more: left }) },
      };
    },
  );
}

/**
 * Stub the "/samples/" folder with three .wav files: f0, f1 and f2.
 */
function mockSampleFolder(): void {
  mockFolderStructure({ "/samples/": createWavEntries(3, "f") });
}

/**
 * Run a plain search and narrow the result to the search shape.
 * @param args - Search args (a query is added)
 * @param ctx - Tool context
 * @returns Item file names, plus the paging fields
 */
async function search(
  args: Parameters<typeof library>[0],
  ctx: Parameters<typeof library>[1] = {},
) {
  const result = await library({ query: "wav", ...args }, ctx);

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

  describe("with a sample folder", () => {
    beforeEach(() => {
      mockSampleFolder();
      mockDb(["a.wav", "b.wav"]);
    });

    const ctx = { sampleFolder: "/samples/" };

    it("fills the first page with folder items and counts the rest", async () => {
      const { names, result } = await search({ limit: 2 }, ctx);

      // The DB is asked for one row, to learn whether any follow.
      expect(names).toStrictEqual(["f0.wav", "f1.wav"]);
      expect(result).toStrictEqual(
        expect.objectContaining({ more: 3, nextOffset: 2 }),
      );
      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "library.search",
        expect.objectContaining({ offset: 0, limit: 1 }),
      );
    });

    it("spans the folder's end into the DB's first rows", async () => {
      const { names, result } = await search({ limit: 2, offset: 2 }, ctx);

      expect(names).toStrictEqual(["f2.wav", "a.wav"]);
      expect(result).toStrictEqual(
        expect.objectContaining({ more: 1, nextOffset: 4 }),
      );
    });

    it("reads the DB from where the folder ended", async () => {
      const { names, result } = await search({ limit: 2, offset: 4 }, ctx);

      expect(names).toStrictEqual(["b.wav"]);
      expect(result).not.toHaveProperty("more");
      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "library.search",
        expect.objectContaining({ offset: 1, limit: 2 }),
      );
    });

    it("puts a folder item that ranks below the DB's ahead of them", async () => {
      mockFolderStructure({
        "/samples/": [{ name: "z.wav", type: "file", extension: ".wav" }],
      });
      // In the DB's own order: highest use-count first.
      mockDb(["a.wav", "c.wav", "b.wav"], {
        "a.wav": 3,
        "c.wav": 2,
        "b.wav": 1,
      });

      const { names, result } = await search({ limit: 3 }, ctx);

      // As before paging: the folder item first, then the DB's top rows.
      expect(names).toStrictEqual(["z.wav", "a.wav", "c.wav"]);
      expect(result).toStrictEqual(
        expect.objectContaining({ more: 1, nextOffset: 3 }),
      );
    });

    it("drops a DB file the folder already listed, keeping the pages aligned", async () => {
      vi.mocked(protocolMock.requestNode).mockImplementation(
        async (_route, routeArgs) => {
          const { offset = 0, limit } = routeArgs as {
            offset?: number;
            limit: number;
          };
          const all = ["/samples/f0.wav", "/L/a.wav", "/L/b.wav"];
          const items = all
            .slice(offset, offset + limit)
            .map((path) => ({ ...dbItem("x"), path }));
          const left = all.length - offset - items.length;

          return {
            success: true,
            result: {
              dbAvailable: true,
              items,
              ...(left > 0 && { more: left }),
            },
          };
        },
      );

      // Positions: f0 f1 f2 | (f0 again) a b. The page is cut by position, so
      // the duplicate leaves it short instead of shifting the next page.
      const first = await search({ limit: 4 }, ctx);
      const second = await search({ limit: 4, offset: 4 }, ctx);

      expect(first.names).toStrictEqual(["f0.wav", "f1.wav", "f2.wav"]);
      expect(first.result).toStrictEqual(
        expect.objectContaining({ more: 2, nextOffset: 4 }),
      );
      expect(second.names).toStrictEqual(["a.wav", "b.wav"]);
      expect(second.result).not.toHaveProperty("more");
    });

    it("pages a folder-only search without asking the DB", async () => {
      const { names, result } = await search(
        { source: "sample-folder", limit: 2 },
        ctx,
      );

      expect(names).toStrictEqual(["f0.wav", "f1.wav"]);
      expect(result).toStrictEqual(
        expect.objectContaining({ more: 1, nextOffset: 2 }),
      );
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    });
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
