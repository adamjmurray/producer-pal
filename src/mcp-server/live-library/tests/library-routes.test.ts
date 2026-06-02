// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNodeRoutes,
  handleNodeRequest,
} from "../../rpc/node-request-protocol.ts";
import { registerLibraryRoutes } from "../library-routes.ts";

vi.mock(import("../query/library-search.ts"), () => ({
  librarySearch: vi.fn(),
}));
vi.mock(import("../query/find-similar.ts"), () => ({
  findSimilar: vi.fn(),
}));
vi.mock(import("../query/find-duplicates.ts"), () => ({
  findDuplicates: vi.fn(),
}));
vi.mock(import("../list-tags.ts"), () => ({
  listTags: vi.fn(),
}));
vi.mock(import("../list-categories.ts"), () => ({
  listCategories: vi.fn(),
}));
vi.mock(import("../list-plugins.ts"), () => ({
  listPlugins: vi.fn(),
}));
vi.mock(import("../../node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const searchMod = await import("../query/library-search.ts");
const similarMod = await import("../query/find-similar.ts");
const duplicatesMod = await import("../query/find-duplicates.ts");
const tagsMod = await import("../list-tags.ts");
const categoriesMod = await import("../list-categories.ts");
const pluginsMod = await import("../list-plugins.ts");

describe("registerLibraryRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerLibraryRoutes();
  });

  afterEach(() => {
    clearNodeRoutes();
  });

  it("registers library.search and dispatches with parsed args", async () => {
    vi.mocked(searchMod.librarySearch).mockResolvedValue({
      dbAvailable: true,
      items: [],
    });

    await handleNodeRequest(
      "req-1",
      JSON.stringify({
        route: "library.search",
        args: { query: "kick", kind: "audio" },
      }),
    );

    expect(searchMod.librarySearch).toHaveBeenCalledWith({
      query: "kick",
      kind: "audio",
    });

    const call = vi.mocked(Max.outlet).mock.calls[0];
    const response = JSON.parse(call?.[2] as string) as {
      success: boolean;
    };

    expect(response.success).toBe(true);
  });

  it("library.search defaults to empty args when null", async () => {
    vi.mocked(searchMod.librarySearch).mockResolvedValue({
      dbAvailable: false,
      items: [],
    });

    await handleNodeRequest(
      "req-2",
      JSON.stringify({ route: "library.search", args: null }),
    );

    expect(searchMod.librarySearch).toHaveBeenCalledWith({});
  });

  it("registers library.listTags and dispatches with parsed args", async () => {
    vi.mocked(tagsMod.listTags).mockResolvedValue({
      dbAvailable: true,
      tags: [{ name: "Kick", count: 99 }],
    });

    await handleNodeRequest(
      "req-3",
      JSON.stringify({ route: "library.listTags", args: { limit: 10 } }),
    );

    expect(tagsMod.listTags).toHaveBeenCalledWith({ limit: 10 });
  });

  it("library.listTags defaults to empty args when null", async () => {
    vi.mocked(tagsMod.listTags).mockResolvedValue({
      dbAvailable: false,
      tags: [],
    });

    await handleNodeRequest(
      "req-4",
      JSON.stringify({ route: "library.listTags", args: null }),
    );

    expect(tagsMod.listTags).toHaveBeenCalledWith({});
  });

  it("registers library.listCategories and dispatches with parsed args", async () => {
    vi.mocked(categoriesMod.listCategories).mockResolvedValue({
      dbAvailable: true,
      category: "Drums",
      tags: [{ name: "Kick", count: 2 }],
    });

    await handleNodeRequest(
      "req-cat",
      JSON.stringify({
        route: "library.listCategories",
        args: { category: "Drums" },
      }),
    );

    expect(categoriesMod.listCategories).toHaveBeenCalledWith({
      category: "Drums",
    });
  });

  it("library.listCategories defaults to empty args when null", async () => {
    vi.mocked(categoriesMod.listCategories).mockResolvedValue({
      dbAvailable: false,
    });

    await handleNodeRequest(
      "req-cat-null",
      JSON.stringify({ route: "library.listCategories", args: null }),
    );

    expect(categoriesMod.listCategories).toHaveBeenCalledWith({});
  });

  it("registers library.listPlugins and dispatches with parsed args", async () => {
    vi.mocked(pluginsMod.listPlugins).mockResolvedValue({
      dbAvailable: true,
      plugins: [],
    });

    await handleNodeRequest(
      "req-5",
      JSON.stringify({
        route: "library.listPlugins",
        args: { format: "VST3", limit: 10 },
      }),
    );

    expect(pluginsMod.listPlugins).toHaveBeenCalledWith({
      format: "VST3",
      limit: 10,
    });
  });

  it("library.listPlugins defaults to empty args when null", async () => {
    vi.mocked(pluginsMod.listPlugins).mockResolvedValue({
      dbAvailable: false,
      plugins: [],
    });

    await handleNodeRequest(
      "req-6",
      JSON.stringify({ route: "library.listPlugins", args: null }),
    );

    expect(pluginsMod.listPlugins).toHaveBeenCalledWith({});
  });

  it("registers library.findSimilar and dispatches with parsed args", async () => {
    vi.mocked(similarMod.findSimilar).mockResolvedValue({
      dbAvailable: true,
      seed: { path: "/x.wav", found: true },
      items: [],
    });

    await handleNodeRequest(
      "req-sim",
      JSON.stringify({
        route: "library.findSimilar",
        args: { similarTo: "/x.wav", tags: "Kick" },
      }),
    );

    expect(similarMod.findSimilar).toHaveBeenCalledWith({
      similarTo: "/x.wav",
      tags: "Kick",
    });
  });

  it("library.findSimilar defaults to empty args when null", async () => {
    vi.mocked(similarMod.findSimilar).mockResolvedValue({
      dbAvailable: false,
      seed: { path: "", found: false },
      items: [],
    });

    await handleNodeRequest(
      "req-sim-null",
      JSON.stringify({ route: "library.findSimilar", args: null }),
    );

    expect(similarMod.findSimilar).toHaveBeenCalledWith({});
  });

  it("registers library.findDuplicates and dispatches with parsed args", async () => {
    vi.mocked(duplicatesMod.findDuplicates).mockResolvedValue({
      dbAvailable: true,
      groups: [],
    });

    await handleNodeRequest(
      "req-dup",
      JSON.stringify({
        route: "library.findDuplicates",
        args: { inFolder: "/Drums" },
      }),
    );

    expect(duplicatesMod.findDuplicates).toHaveBeenCalledWith({
      inFolder: "/Drums",
    });
  });

  it("library.findDuplicates defaults to empty args when null", async () => {
    vi.mocked(duplicatesMod.findDuplicates).mockResolvedValue({
      dbAvailable: false,
      groups: [],
    });

    await handleNodeRequest(
      "req-dup-null",
      JSON.stringify({ route: "library.findDuplicates", args: null }),
    );

    expect(duplicatesMod.findDuplicates).toHaveBeenCalledWith({});
  });
});
