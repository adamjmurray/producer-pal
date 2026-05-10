// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNodeRoutes,
  handleNodeRequest,
} from "../rpc/node-request-protocol.ts";
import { registerLibraryRoutes } from "./library-routes.ts";

vi.mock(import("./search-samples.ts"), () => ({
  searchSamples: vi.fn(),
}));
vi.mock(import("../node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const samplesMod = await import("./search-samples.ts");

describe("registerLibraryRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registerLibraryRoutes();
  });

  afterEach(() => {
    clearNodeRoutes();
  });

  it("registers library.searchSamples and dispatches with parsed args", async () => {
    vi.mocked(samplesMod.searchSamples).mockResolvedValue({
      source: "live-db",
      dbAvailable: true,
      samples: [{ path: "/x/kick.wav", name: "kick.wav", useCount: 7 }],
    });

    await handleNodeRequest(
      "req-1",
      JSON.stringify({
        route: "library.searchSamples",
        args: { query: "kick", limit: 10 },
      }),
    );

    expect(samplesMod.searchSamples).toHaveBeenCalledWith({
      query: "kick",
      limit: 10,
    });

    const call = vi.mocked(Max.outlet).mock.calls[0];
    const response = JSON.parse(call?.[2] as string) as {
      success: boolean;
      result: { samples: Array<{ name: string }> };
    };

    expect(response.success).toBe(true);
    expect(response.result.samples[0]?.name).toBe("kick.wav");
  });

  it("defaults to empty args when none are provided", async () => {
    vi.mocked(samplesMod.searchSamples).mockResolvedValue({
      source: "live-db",
      dbAvailable: false,
      samples: [],
    });

    await handleNodeRequest(
      "req-2",
      JSON.stringify({ route: "library.searchSamples", args: null }),
    );

    expect(samplesMod.searchSamples).toHaveBeenCalledWith({});
  });
});
