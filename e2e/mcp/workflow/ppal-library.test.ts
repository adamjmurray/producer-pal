// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-library tool.
 *
 * The search action merges results from a V8-side folder scan (when a
 * sampleFolder is configured) with a Node-side query against Live's
 * Library.db. Library.db contents vary by machine, so tests assert on
 * envelope shape and folder-scan determinism rather than specific DB
 * items.
 *
 * Run with: npm run e2e:mcp -- ppal-library
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isToolError,
  parseToolResult,
  setConfig,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_FOLDER = resolve(__dirname, "../../../evals/live-sets/samples");

interface LibraryItem {
  name: string;
  path: string;
  kind: string | null;
  subtype?: "midi" | "audio";
  tags: string[];
  useCount: number;
  source: string | null;
}

interface LibrarySearchResult {
  items: LibraryItem[];
  /** Present when DB was consulted; omitted when bypassed (source=sampleFolder). */
  dbAvailable?: boolean;
  reason?: string;
}

interface LibraryListTagsResult {
  tags: Array<{ name: string; count: number }>;
  dbAvailable?: boolean;
  reason?: string;
}

interface LibrarySimilarItem extends LibraryItem {
  similarity: number;
}

interface LibraryFindSimilarResult {
  seed: { path: string; found: boolean };
  items: LibrarySimilarItem[];
  dbAvailable?: boolean;
  reason?: string;
}

interface LibraryFindDuplicatesResult {
  groups: Array<{ count: number; items: LibraryItem[] }>;
  dbAvailable?: boolean;
  reason?: string;
}

type LibraryArgs = Record<string, string | number | undefined>;

async function callLibrary(args: LibraryArgs = {}): Promise<unknown> {
  return ctx.client!.callTool({ name: "ppal-library", arguments: args });
}

async function search(args: LibraryArgs = {}): Promise<LibrarySearchResult> {
  return parseToolResult<LibrarySearchResult>(await callLibrary(args));
}

async function listTags(
  args: LibraryArgs = {},
): Promise<LibraryListTagsResult> {
  return parseToolResult<LibraryListTagsResult>(
    await callLibrary({ action: "listTags", ...args }),
  );
}

async function findSimilar(
  args: LibraryArgs = {},
): Promise<LibraryFindSimilarResult> {
  return parseToolResult<LibraryFindSimilarResult>(
    await callLibrary({ action: "findSimilar", ...args }),
  );
}

async function findDuplicates(
  args: LibraryArgs = {},
): Promise<LibraryFindDuplicatesResult> {
  return parseToolResult<LibraryFindDuplicatesResult>(
    await callLibrary({ action: "findDuplicates", ...args }),
  );
}

describe("ppal-library", () => {
  describe("folder source (deterministic)", () => {
    it("returns folder-only items when source=sampleFolder", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const result = await search({ source: "sampleFolder" });

      expect(result.items).toHaveLength(2);

      for (const item of result.items) {
        expect(item.source).toBe("sampleFolder");
        expect(item.kind).toBe("audio");
        expect(item.useCount).toBe(0);
        expect(item.tags).toStrictEqual([]);
        expect(item.path.startsWith(SAMPLE_FOLDER)).toBe(true);
      }

      const names = result.items.map((i) => i.name).toSorted();

      expect(names).toStrictEqual(["kick.aiff", "sample.aiff"]);
    });

    it("filters folder items by query substring", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const result = await search({ source: "sampleFolder", query: "kick" });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.name).toBe("kick.aiff");
    });

    it("returns empty folder results when no sampleFolder is configured", async () => {
      await setConfig({ sampleFolder: "" });

      const result = await search({ source: "sampleFolder" });

      expect(result.items).toStrictEqual([]);
    });

    it("merges folder items into a default audio search ahead of DB items", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const result = await search({ query: "kick" });

      // Folder items are biased to the front of merged results regardless
      // of the DB's use_count ranking. Even with the default limit of 50,
      // the user's configured sample folder should always surface first.
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items[0]?.source).toBe("sampleFolder");
      expect(result.items[0]?.name).toBe("kick.aiff");
    });

    it("suppresses folder scan when kind != audio", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const result = await search({ kind: "midi" });

      expect(result.items.every((i) => i.source !== "sampleFolder")).toBe(true);
    });

    it("suppresses folder scan when tags are present", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const result = await search({ tags: "Kick" });

      expect(result.items.every((i) => i.source !== "sampleFolder")).toBe(true);
    });

    it("suppresses folder scan when deviceKind is present", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const result = await search({
        kind: "preset",
        deviceKind: "instrument",
      });

      expect(result.items.every((i) => i.source !== "sampleFolder")).toBe(true);
    });

    it("suppresses folder scan when source is non-sampleFolder", async () => {
      await setConfig({ sampleFolder: SAMPLE_FOLDER });

      const result = await search({ source: "user" });

      expect(result.items.every((i) => i.source !== "sampleFolder")).toBe(true);
    });
  });

  describe("result envelope", () => {
    it("returns search envelope with dbAvailable=true and items array", async () => {
      const result = await search();

      expect(result.dbAvailable).toBe(true);
      expect(Array.isArray(result.items)).toBe(true);
    });

    it("returns listTags envelope with dbAvailable=true and tags array", async () => {
      const result = await listTags();

      expect(result.dbAvailable).toBe(true);
      expect(Array.isArray(result.tags)).toBe(true);
    });

    it("listTags entries have a non-empty name, positive count, and count-desc order", async () => {
      const result = await listTags({ limit: 5 });

      expect(result.dbAvailable).toBe(true);
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.tags.length).toBeLessThanOrEqual(5);

      for (const tag of result.tags) {
        expect(typeof tag.name).toBe("string");
        expect(tag.name.length).toBeGreaterThan(0);
        expect(tag.count).toBeGreaterThan(0);
      }

      const counts = result.tags.map((t) => t.count);
      const sortedDesc = counts.toSorted((a, b) => b - a);

      expect(counts).toStrictEqual(sortedDesc);
    });
  });

  describe("DB filters", () => {
    it("kind filter only returns items of that kind", async () => {
      const result = await search({ kind: "midi" });

      // Folder scan suppressed when kind != audio, so all items are DB items.
      // kind:midi covers .mid files (kind "midi") plus MIDI Live clips, which
      // keep their file-format kind "live-clip" qualified by subtype "midi".
      for (const item of result.items) {
        const isMidi =
          item.kind === "midi" ||
          (item.kind === "live-clip" && item.subtype === "midi");

        expect(isMidi).toBe(true);
      }
    });

    it("source filter only returns items from that source", async () => {
      const result = await search({ source: "user" });

      for (const item of result.items) {
        expect(item.source).toBe("user");
      }
    });

    it("tags filter returns items containing the requested tag (case-insensitive)", async () => {
      const tagsResult = await listTags({ limit: 10 });

      if (!tagsResult.dbAvailable || tagsResult.tags.length === 0) {
        // No tags on this machine — nothing to assert
        return;
      }

      const tagName = tagsResult.tags[0]!.name;
      const result = await search({ tags: tagName.toUpperCase() });

      if (result.items.length === 0) {
        // Tag exists but no items match the kind=audio default — acceptable
        return;
      }

      const lower = tagName.toLowerCase();

      for (const item of result.items) {
        expect(item.tags.map((t) => t.toLowerCase())).toContain(lower);
      }
    });
  });

  describe("sort & limit", () => {
    it("limit caps the number of returned items", async () => {
      const result = await search({ limit: 1 });

      expect(result.items.length).toBeLessThanOrEqual(1);
    });

    it("name sort returns items alphabetically", async () => {
      const result = await search({ sort: "name", limit: 50 });

      if (result.items.length < 2) {
        return;
      }

      for (let i = 1; i < result.items.length; i++) {
        const prev = result.items[i - 1]!.name.toLowerCase();
        const curr = result.items[i]!.name.toLowerCase();

        expect(prev.localeCompare(curr)).toBeLessThanOrEqual(0);
      }
    });

    it("default sort (use_count desc) is deterministic across repeated calls", async () => {
      const a = await search({ limit: 20 });
      const b = await search({ limit: 20 });

      expect(a.items.map((i) => i.path)).toStrictEqual(
        b.items.map((i) => i.path),
      );
    });
  });

  describe("findDuplicates (audio fingerprint)", () => {
    it("returns duplicate groups of byte-identical audio, largest first", async () => {
      const result = await findDuplicates();

      expect(result.dbAvailable).toBe(true);
      expect(Array.isArray(result.groups)).toBe(true);

      for (const group of result.groups) {
        // A group is a real duplicate set: at least two members, count matches.
        expect(group.count).toBeGreaterThanOrEqual(2);
        expect(group.items.length).toBe(group.count);
      }

      const counts = result.groups.map((g) => g.count);

      expect(counts).toStrictEqual(counts.toSorted((a, b) => b - a));
    });
  });

  describe("findSimilar (audio similarity)", () => {
    it("ranks candidates by similarity to a fingerprinted seed", async () => {
      // Any file in a duplicate group is guaranteed to have a fingerprint, so
      // it's a reliable seed regardless of which Library.db this machine has.
      const dups = await findDuplicates();
      const seedPath = dups.groups[0]?.items[0]?.path;

      if (seedPath == null) {
        // No duplicate samples on this machine — nothing to seed from.
        return;
      }

      const result = await findSimilar({ similarTo: seedPath });

      expect(result.dbAvailable).toBe(true);
      expect(result.seed).toStrictEqual({ path: seedPath, found: true });

      const sims = result.items.map((i) => i.similarity);

      // Scores are valid cosines and returned in descending order.
      for (const s of sims) {
        expect(s).toBeGreaterThanOrEqual(-1.0001);
        expect(s).toBeLessThanOrEqual(1.0001);
      }

      expect(sims).toStrictEqual(sims.toSorted((a, b) => b - a));
      // The seed itself is never in its own results.
      expect(result.items.every((i) => i.path !== seedPath)).toBe(true);
      // The seed's byte-identical duplicate twin is a ~1.0 top match.
      expect(result.items[0]?.similarity).toBeGreaterThan(0.99);
    });

    it("reports a seed that isn't in the library without throwing", async () => {
      const result = await findSimilar({
        similarTo: "/no/such/seed/file.wav",
      });

      expect(result.seed.found).toBe(false);
      expect(result.items).toStrictEqual([]);
      expect(typeof result.reason).toBe("string");
    });

    it("reports a missing similarTo arg without throwing", async () => {
      const result = await findSimilar();

      expect(result.seed.found).toBe(false);
      expect(result.reason).toContain("similarTo");
    });
  });

  describe("action validation", () => {
    it("rejects unknown actions with an error", async () => {
      const result = await callLibrary({ action: "bogus" });

      expect(isToolError(result)).toBe(true);
    });
  });
});
