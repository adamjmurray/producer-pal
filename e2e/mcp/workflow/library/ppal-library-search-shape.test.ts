// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for what a ppal-library search accepts and how its items look: a
 * search with no query or filter is refused, search `limit` is capped at 200, and an
 * item leaves out what its path or the request already says.
 *
 * Library.db contents vary by machine, so the assertions state invariants that
 * hold whatever is in it. Live's Core Library ships with every install, so the
 * item-shape cases search it.
 *
 * Run with: npm run e2e:mcp -- ppal-library-search-shape
 */
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setupMcpTestContext,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

/** The most items any library call returns, mirrored from MAX_SEARCH_LIMIT. */
const MAX_ITEMS = 200;

interface ShapeItem {
  name?: string;
  path: string;
  kind?: string | null;
  tags: string[];
  useCount?: number;
  source?: string | null;
  folder?: string;
}

interface ShapeResult {
  items: ShapeItem[];
  dbAvailable?: boolean;
  note?: string;
}

interface ShapeBatch {
  results: Array<{ label: string; items: ShapeItem[]; note?: string }>;
}

/** Two words no file name holds, so the search finds nothing on any machine. */
const NONSENSE = "zqxjv wkpqz";
const MULTI_WORD_NOTE =
  "query matches as one substring, not keywords. Use * between words (zqxjv*wkpqz), or tags/type for the rest.";

/**
 * Call ppal-library.
 * @param args - The tool args
 * @returns The raw tool result
 */
async function call(args: Record<string, unknown>): Promise<unknown> {
  return ctx.client!.callTool({ name: "ppal-library", arguments: args });
}

describe("ppal-library search shape", () => {
  describe("a search with no query or filter", () => {
    it("is refused, saying what to add", async () => {
      // The call that filled a small model's context with 1000 items.
      const result = await call({ limit: 1_001_001_001_001_001 });

      expect(isToolError(result)).toBe(true);
      expect(getToolErrorMessage(result)).toContain(
        "search needs a query or a filter",
      );
      expect(getToolErrorMessage(result)).toContain(
        "Add one of query, tags, type, deviceKind, source, inFolder, or a kind other than audio.",
      );
    });

    it("is refused for the default kind alone", async () => {
      const result = await call({ kind: "audio" });

      expect(isToolError(result)).toBe(true);
    });

    it("refuses a searches call when one entry has none, running no entry", async () => {
      const result = await call({
        searches: [
          { label: "snare", query: "snare" },
          { label: "kick", limit: 1_001_001_001_001_001 },
        ],
      });

      expect(isToolError(result)).toBe(true);
      expect(getToolErrorMessage(result)).toContain(
        'searches "kick" has no query or filter',
      );
    });

    it("runs a search that has any one filter", async () => {
      expect(isToolError(await call({ type: "oneshot", limit: 1 }))).toBe(
        false,
      );
    });
  });

  describe("a multi-word query that finds nothing", () => {
    it("says the query is one substring", async ({ skip }) => {
      const result = parseToolResult<ShapeResult>(
        await call({ query: NONSENSE }),
      );

      skip(result.dbAvailable !== true, "Live's library database not found");

      expect(result.items).toStrictEqual([]);
      expect(result.note).toBe(MULTI_WORD_NOTE);
    });

    it("says nothing for one word that finds nothing", async ({ skip }) => {
      const result = parseToolResult<ShapeResult>(
        await call({ query: "zqxjvwkpqz" }),
      );

      skip(result.dbAvailable !== true, "Live's library database not found");

      expect(result.items).toStrictEqual([]);
      expect(result.note).toBeUndefined();
    });

    it("notes each searches entry that found nothing, and no other", async ({
      skip,
    }) => {
      const result = parseToolResult<ShapeBatch>(
        await call({
          searches: [
            { label: "words", query: NONSENSE },
            { label: "word", query: "zqxjvwkpqz" },
          ],
        }),
      );

      skip(
        result.results[0]?.note == null,
        "Live's library database not found",
      );

      expect(result.results.map((r) => r.note)).toStrictEqual([
        MULTI_WORD_NOTE,
        undefined,
      ]);
    });
  });

  describe("limit", () => {
    it("is capped at 200 whatever is asked", async () => {
      const capped = parseToolResult<ShapeResult>(
        await call({ query: "a", limit: 1_001_001_001_001_001 }),
      );
      const atMax = parseToolResult<ShapeResult>(
        await call({ query: "a", limit: MAX_ITEMS }),
      );

      expect(capped.items.length).toBeLessThanOrEqual(MAX_ITEMS);
      // A machine with a full library has more than 200 matches, so the cap is
      // what stops the list; a small one returns the same short list.
      expect(capped.items).toHaveLength(atMax.items.length);
    });
  });

  describe("item shape", () => {
    it("leaves out the source and kind the search already named", async () => {
      const { items } = parseToolResult<ShapeResult>(
        await call({ source: "builtin", kind: "audio", query: "kick" }),
      );

      expect(items.length).toBeGreaterThan(0);

      for (const item of items) {
        expect(item.source).toBeUndefined();
        expect(item.kind).toBeUndefined();
      }
    });

    it("keeps source when the search names none, and drops the default kind", async () => {
      const { items } = parseToolResult<ShapeResult>(
        await call({ query: "kick" }),
      );

      expect(items.length).toBeGreaterThan(0);
      // Nothing filtered by source, so every item says where it lives.
      expect(items.every((i) => i.source !== undefined)).toBe(true);
      // The default kind is audio and these are audio, so none repeats it.
      expect(items.every((i) => i.kind === undefined)).toBe(true);
    });

    it("never repeats the file name, the folder, or a zero useCount", async ({
      skip,
    }) => {
      const { items } = parseToolResult<ShapeResult>(
        await call({ query: "a", limit: 50 }),
      );

      skip(items.length === 0, "no library items match the query");

      for (const item of items) {
        const segments = item.path.split("/");

        expect(item.name).toBeUndefined();
        // A folder that stays is one the path spells differently.
        expect(item.folder).not.toBe(segments.at(-2));
        expect(item.useCount).not.toBe(0);
      }
    });
  });
});
