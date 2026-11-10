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
 * Stub the library routes as a DB holding the given items, each with its
 * position as its file id. library.search honors excludeFileIds, offset and
 * limit and reports how many rows follow its window, as the real route does;
 * library.resolveFileIds finds the ids of the paths the DB lists, ignoring
 * case.
 * @param names - The matching files, in the order the DB returns them; a name
 *   starting with "/" is a full path
 * @param useCounts - Use count per name
 */
function mockDb(
  names: string[] = DB_NAMES,
  useCounts: Record<string, number> = {},
): void {
  const rows: Array<{ id: number; item: Record<string, unknown> }> = names.map(
    (name, i) => ({
      id: i + 1,
      item: { ...dbItem(name), useCount: useCounts[name] ?? 0 },
    }),
  );

  vi.mocked(protocolMock.requestNode).mockImplementation(
    async (route, routeArgs) => {
      if (route === "library.resolveFileIds") {
        const { paths } = routeArgs as { paths: string[] };
        const wanted = new Set(paths.map((p) => p.toLowerCase()));
        const fileIds = rows
          .filter((r) => wanted.has(String(r.item.path).toLowerCase()))
          .map((r) => r.id);

        return { success: true, result: { fileIds } };
      }

      const {
        offset = 0,
        limit,
        excludeFileIds = [],
      } = routeArgs as {
        offset?: number;
        limit: number;
        excludeFileIds?: number[];
      };
      const kept = rows.filter((r) => !excludeFileIds.includes(r.id));
      const items = kept.slice(offset, offset + limit).map((r) => r.item);
      const left = kept.length - offset - items.length;

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

  it("looks up no ids without a sample folder", async () => {
    mockDb();

    await search({ limit: 2 });

    expect(protocolMock.requestNode).toHaveBeenCalledTimes(1);
    expect(protocolMock.requestNode).toHaveBeenCalledWith(
      "library.search",
      expect.not.objectContaining({ excludeFileIds: expect.anything() }),
    );
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

    it("shows a file both sources list once, with full pages and an exact count", async () => {
      // The DB also lists f0, whose casing differs from the folder's.
      mockDb(["/samples/F0.WAV", "/L/a.wav", "/L/b.wav"]);

      const first = await search({ limit: 4 }, ctx);
      const second = await search({ limit: 4, offset: 4 }, ctx);

      expect(first.names).toStrictEqual([
        "f0.wav",
        "f1.wav",
        "f2.wav",
        "a.wav",
      ]);
      expect(first.result).toStrictEqual(
        expect.objectContaining({ more: 1, nextOffset: 4 }),
      );
      expect(second.names).toStrictEqual(["b.wav"]);
      expect(second.result).not.toHaveProperty("more");
      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "library.search",
        expect.objectContaining({ excludeFileIds: [1] }),
      );
    });

    it.each([
      ["answers with a failure", { success: false, error: "timed out" }],
      ["throws", new Error("boom")],
    ])(
      "still searches, showing a shared file once, when the id lookup %s",
      async (_name, failure) => {
        mockDb(["/samples/F0.WAV", "/L/a.wav", "/L/b.wav"]);

        const dbRoute = vi
          .mocked(protocolMock.requestNode)
          .getMockImplementation()!;

        vi.mocked(protocolMock.requestNode).mockImplementation(
          async (route, routeArgs, timeout) => {
            if (route !== "library.resolveFileIds") {
              return await dbRoute(route, routeArgs, timeout);
            }

            if (failure instanceof Error) {
              throw failure;
            }

            return failure;
          },
        );

        const { names } = await search({ limit: 4 }, ctx);

        expect(names).toStrictEqual(["f0.wav", "f1.wav", "f2.wav"]);
        expect(protocolMock.requestNode).toHaveBeenCalledWith(
          "library.search",
          expect.not.objectContaining({ excludeFileIds: expect.anything() }),
        );
      },
    );

    it("reports no more when every remaining DB match is a folder file", async () => {
      mockDb(["/samples/f1.wav", "/samples/f2.wav"]);

      const { names, result } = await search({ limit: 3 }, ctx);

      expect(names).toStrictEqual(["f0.wav", "f1.wav", "f2.wav"]);
      expect(result).not.toHaveProperty("more");
      expect(result).not.toHaveProperty("nextOffset");
    });

    it("sends no exclusion when the DB lists none of the folder's files", async () => {
      await search({ limit: 4 }, ctx);

      expect(protocolMock.requestNode).toHaveBeenCalledWith(
        "library.search",
        expect.not.objectContaining({ excludeFileIds: expect.anything() }),
      );
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

    it("skips the folder's files in every entry", async () => {
      mockSampleFolder();
      mockDb(["/samples/f0.wav", "/L/a.wav", "/L/b.wav"]);

      const result = await library(
        {
          searches: [
            { label: "One", query: "wav", limit: 4 },
            { label: "Two", query: "wav", limit: 4, offset: 4 },
          ],
        },
        { sampleFolder: "/samples/" },
      );

      if (!("results" in result)) {
        throw new Error("expected results");
      }

      const [one, two] = result.results;

      expect(one).toStrictEqual(
        expect.objectContaining({ more: 1, nextOffset: 4 }),
      );
      expect(one?.items).toHaveLength(4);
      expect(two?.items.map((i) => i.path)).toStrictEqual(["/L/b.wav"]);
      expect(two).not.toHaveProperty("more");
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
