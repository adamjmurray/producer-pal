// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { library } from "../../../library.ts";
import { multiWordQueryNote } from "../../../helpers/library/multi-word-query-note.ts";

vi.mock(
  import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts"),
  () => ({
    requestNode: vi.fn(),
    handleNodeResponse: vi.fn(),
  }),
);

const protocolMock =
  await import("#src/live-api-adapter/protocols/node-request-v8-protocol.ts");

const NOTE =
  "query matches as one substring, not keywords. Use * between words (kick*house), or tags/type for the rest.";

/**
 * Answer every library.search with an empty DB result.
 * @param extra - Fields to add to the result (a note, a detail, ...)
 */
function mockEmptyDb(extra: Record<string, unknown> = {}): void {
  vi.mocked(protocolMock.requestNode).mockResolvedValue({
    success: true,
    result: { dbAvailable: true, items: [], ...extra },
  });
}

describe("library tool: multi-word query note", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("explains the matching when a plain search finds nothing", async () => {
    mockEmptyDb();

    expect(await library({ query: "kick house oneshot" })).toStrictEqual({
      dbAvailable: true,
      items: [],
      note: NOTE,
    });
  });

  it("says nothing for a single word", async () => {
    mockEmptyDb();

    expect(await library({ query: "kick" })).not.toHaveProperty("note");
  });

  it("says nothing on a page past the first", async () => {
    mockEmptyDb();

    expect(
      await library({ query: "kick house", offset: 5 }),
    ).not.toHaveProperty("note");
  });

  it("says nothing when the DB found something", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: {
        dbAvailable: true,
        items: [{ name: "big kick.wav", path: "/L/big kick.wav", tags: [] }],
      },
    });

    expect(await library({ query: "big kick" })).not.toHaveProperty("note");
  });

  it("joins the DB's own note", async () => {
    mockEmptyDb({ note: "DB NOTE" });

    expect(await library({ query: "kick house" })).toHaveProperty(
      "note",
      `DB NOTE; ${NOTE}`,
    );
  });

  it("leaves a detail that already says why nothing came back", async () => {
    mockEmptyDb({ dbAvailable: false, detail: "Live database not found" });

    const result = await library({ query: "kick house" });

    expect(result).toHaveProperty("detail", "Live database not found");
    expect(result).not.toHaveProperty("note");
  });

  it("notes each searches entry on its own", async () => {
    mockEmptyDb();

    const result = await library({
      searches: [
        { label: "words", query: "kick house" },
        { label: "word", query: "snare" },
      ],
    });

    expect(result).toHaveProperty("results", [
      { label: "words", items: [], note: NOTE },
      { label: "word", items: [] },
    ]);
  });

  it("keeps the note when a lone entry answers like a plain search", async () => {
    mockEmptyDb();

    expect(
      await library({ searches: [{ query: "kick house" }] }),
    ).toStrictEqual({ dbAvailable: true, items: [], note: NOTE });
  });
});

describe("multiWordQueryNote", () => {
  it("builds the example from the first two words", () => {
    expect(multiWordQueryNote("  closed  hat oneshot ", 0)).toContain(
      "(closed*hat)",
    );
  });

  it("applies when the query already has a *", () => {
    expect(multiWordQueryNote("kick* house", 0)).toContain("(kick*house)");
  });

  it("leaves out the example when there aren't two plain words", () => {
    expect(multiWordQueryNote("kick *", 0)).toBe(
      "query matches as one substring, not keywords. Use * between words, or tags/type for the rest.",
    );
    expect(multiWordQueryNote(`${"a".repeat(30)} b`, 0)).not.toContain("(");
  });

  it("does not apply to no query, one word, or any found match", () => {
    expect(multiWordQueryNote(undefined, 0)).toBeUndefined();
    expect(multiWordQueryNote("kick", 0)).toBeUndefined();
    expect(multiWordQueryNote(" kick ", 0)).toBeUndefined();
    expect(multiWordQueryNote("kick house", 1)).toBeUndefined();
  });
});
