// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * E2E tests for what a ppal-library search accepts and how its items look: a
 * search with no query or filter is refused, search `limit` is capped at 200, and an
 * item leaves out what its path or the request already says.
 *
 * Library.db contents vary by machine, so the DB assertions state invariants
 * that hold whatever is in it; the sample folder gives the exact case.
 *
 * Run with: npm run e2e:mcp -- ppal-library-search-shape
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getToolErrorMessage,
  isToolError,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
} from "../../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_FOLDER = resolve(__dirname, "../../../../evals/live-sets/samples");

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
}

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
    it("leaves a sample-folder item with just its path and tags", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const { items } = parseToolResult<ShapeResult>(
        await call({ source: "sample-folder", query: "kick" }),
      );

      expect(items).toStrictEqual([
        { path: `${SAMPLE_FOLDER}/drums/kick.aiff`, tags: [] },
      ]);
    });

    it("keeps source when the search names none, and drops the default kind", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const { items } = parseToolResult<ShapeResult>(
        await call({ query: "kick" }),
      );
      const folderItem = items.find((i) => i.source === "sample-folder");

      // Nothing filtered by source, so every item says where it lives.
      expect(items.every((i) => i.source !== undefined)).toBe(true);
      expect(folderItem).toBeDefined();
      // The default kind is audio and these are audio, so none repeats it.
      expect(items.every((i) => i.kind === undefined)).toBe(true);
    });

    it("never repeats the file name, the folder, or a zero useCount", async () => {
      const { items } = parseToolResult<ShapeResult>(
        await call({ query: "a", limit: 50 }),
      );

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
