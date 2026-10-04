// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { library } from "../library.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

type LibraryArgs = NonNullable<Parameters<typeof library>[0]>;

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

describe("library - params the action doesn't read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(protocolMock.requestNode).mockResolvedValue({
      success: true,
      result: { dbAvailable: true, items: [], tags: [], plugins: [] },
    });
  });

  // The call that started it: with no action it ran a plain search, returned
  // unrelated samples with no distance, and said nothing.
  it("refuses similarTo with no action instead of running a plain search", async () => {
    await expect(library({ similarTo: "/samples/kick.wav" })).rejects.toThrow(
      'similarTo is only for action "find-similar"; this call has action "search". Change the action or drop similarTo.',
    );
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it.each([
    {
      param: "category",
      args: { category: "Sounds" },
      action: "search",
      home: "list-categories",
    },
    {
      param: "vendor",
      args: { vendor: "xfer" },
      action: "search",
      home: "list-plugins",
    },
    {
      param: "format",
      args: { format: "VST" },
      action: "list-tags",
      home: "list-plugins",
    },
    {
      param: "subcategory",
      args: { subcategory: "synth" },
      action: "search",
      home: "list-plugins",
    },
    {
      param: "sort",
      args: { sort: "name" },
      action: "find-similar",
      home: "search",
    },
    {
      param: "verifyPaths",
      args: { verifyPaths: false },
      action: "list-plugins",
      home: "search",
    },
  ])("refuses $param on $action", async ({ param, args, action, home }) => {
    await expect(library({ action, ...args } as LibraryArgs)).rejects.toThrow(
      new RegExp(`^${param} is only for action "${home}"`),
    );
    expect(protocolMock.requestNode).not.toHaveBeenCalled();
  });

  it.each(["list-tags", "list-categories", "list-plugins"])(
    "refuses the search filters on %s",
    async (action) => {
      await expect(
        library({ action, tags: "Kick", type: "oneshot" }),
      ).rejects.toThrow(/^tags, type are only for action "search"/);
      expect(protocolMock.requestNode).not.toHaveBeenCalled();
    },
  );

  it("refuses a non-default kind where no search runs, but not the default", async () => {
    await expect(
      library({ action: "list-plugins", kind: "plugin" }),
    ).rejects.toThrow(/^kind is only for action "search"/);
    await expect(
      library({ action: "list-plugins", kind: "audio" }),
    ).resolves.toBeDefined();
  });

  it("refuses the old queries name as it was sent", async () => {
    await expect(
      library({ action: "list-tags", queries: [{ tags: "Kick" }] }),
    ).rejects.toThrow(/^queries is only for action "search"/);
  });

  it("names the action search-batch resolves to", async () => {
    await expect(
      library({ action: "search-batch", similarTo: "/a.wav" }),
    ).rejects.toThrow('this call has action "search"');
  });

  it("lets find-similar and find-duplicates take the search filters", async () => {
    await library({
      action: "find-similar",
      similarTo: "/a.wav",
      tags: "Kick",
      query: "k",
      source: "user",
      limit: 5,
    });
    await library({ action: "find-duplicates", tags: "Kick", inFolder: "/x" });

    expect(protocolMock.requestNode).toHaveBeenCalledTimes(2);
  });

  it("lets list-plugins take query and deviceKind, and every action take limit", async () => {
    await library({
      action: "list-plugins",
      query: "serum",
      deviceKind: "instrument",
    });
    await library({ action: "list-tags", limit: 10 });
    await library({ action: "list-categories", category: "Sounds", limit: 10 });

    expect(protocolMock.requestNode).toHaveBeenCalledTimes(3);
  });

  it("counts a null or blank as not sent", async () => {
    await expect(
      library({
        action: "list-tags",
        similarTo: undefined,
        category: "",
        vendor: "  ",
      }),
    ).resolves.toBeDefined();
  });
});
