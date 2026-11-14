// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { type LibrarySearchArgs } from "#src/mcp-server/live-library/library-types.ts";
import { refuseUnfilteredSearch } from "../../helpers/library/library-unfiltered-search.ts";
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

describe("refuseUnfilteredSearch", () => {
  it.each<[string, LibrarySearchArgs]>([
    ["query", { query: "kick" }],
    ["tags", { tags: "Kick" }],
    ["type", { type: "oneshot" }],
    ["deviceKind", { deviceKind: "instrument" }],
    ["source", { source: "pack" }],
    ["inFolder", { inFolder: "/L/Drums" }],
    ["a kind other than audio", { kind: "preset" }],
  ])("lets a search with %s through", (_name, args) => {
    expect(() => refuseUnfilteredSearch(args, undefined)).not.toThrow();
    expect(() => refuseUnfilteredSearch({}, [args])).not.toThrow();
  });

  it.each<[string, LibrarySearchArgs]>([
    ["nothing", {}],
    ["only a label and a limit", { limit: 1001001001001001 }],
    ["the default audio kind", { kind: "audio" }],
    ["sort and verifyPaths", { sort: "name", verifyPaths: true }],
    ["blank strings", { query: "", tags: " , ", inFolder: "  " }],
  ])("refuses a search with %s", (_name, args) => {
    expect(() => refuseUnfilteredSearch(args, undefined)).toThrow(
      /^search needs a query or a filter.*Add one of query, tags, type, deviceKind, source, inFolder, or a kind other than audio\.$/,
    );
  });

  it("names each searches entry that has neither, by label or index", () => {
    expect(() =>
      refuseUnfilteredSearch({}, [
        { label: "Kicks", query: "kick" },
        { label: "kick", limit: 1000 },
        {},
      ]),
    ).toThrow(
      'searches "kick", "2" have no query or filter, so would list the library\'s first files. Add one of query, tags, type, deviceKind, source, inFolder, or a kind other than audio to each.',
    );
  });

  it("words a single bare entry in the singular", () => {
    expect(() => refuseUnfilteredSearch({}, [{ label: "kick" }])).toThrow(
      /^searches "kick" has no query or filter.* to it\.$/,
    );
  });
});

describe("library search with no query or filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses a plain search before reading anything", async () => {
    await expect(library({ limit: 1000 })).rejects.toThrow(
      "search needs a query or a filter",
    );
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it("refuses the whole searches call when one entry is bare, running none", async () => {
    await expect(
      library({
        searches: [
          { label: "snare", query: "snare" },
          { label: "kick", limit: 1001001001001001 },
        ],
      }),
    ).rejects.toThrow('searches "kick" has no query or filter');
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it("does not ask find-similar or list actions for a filter", async () => {
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, tags: [], plugins: [], groups: [] },
    });

    await expect(library({ action: "list-tags" })).resolves.toBeDefined();
    await expect(library({ action: "find-duplicates" })).resolves.toBeDefined();
  });
});
