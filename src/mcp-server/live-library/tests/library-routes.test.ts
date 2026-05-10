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

vi.mock(import("../library-search.ts"), () => ({
  librarySearch: vi.fn(),
}));
vi.mock(import("../list-tags.ts"), () => ({
  listTags: vi.fn(),
}));
vi.mock(import("../../node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const searchMod = await import("../library-search.ts");
const tagsMod = await import("../list-tags.ts");

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
      source: "live-db",
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
      source: "live-db",
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
      source: "live-db",
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
      source: "live-db",
      dbAvailable: false,
      tags: [],
    });

    await handleNodeRequest(
      "req-4",
      JSON.stringify({ route: "library.listTags", args: null }),
    );

    expect(tagsMod.listTags).toHaveBeenCalledWith({});
  });
});
