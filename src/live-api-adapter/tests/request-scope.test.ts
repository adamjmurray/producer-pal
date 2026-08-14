// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A tool call releases the LiveAPI objects it built, so Live's path listeners
// don't outlive the request. See live-api-release.ts.

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";

vi.mock(import("#src/live-api-adapter/project-context-sync.ts"), () => ({
  backupProjectContextOnEdit: vi.fn(),
  noteProjectContextLoaded: vi.fn(),
  syncProjectContextBackup: vi.fn(),
  resetProjectContextSyncMemo: vi.fn(),
}));

const { mcp_request } =
  await import("#src/live-api-adapter/live-api-adapter.ts");

/**
 * Run one request, collecting every LiveAPI object built while it ran.
 *
 * @param tool - Tool name to dispatch
 * @param args - Tool arguments
 * @returns The objects the request built
 */
async function requestBuilding(
  tool: string,
  args: object,
): Promise<{ path: string }[]> {
  const created: { path: string }[] = [];
  const originalFrom = LiveAPI.from.bind(LiveAPI);

  LiveAPI.from = ((idOrPath: Parameters<typeof LiveAPI.from>[0]) => {
    const api = originalFrom(idOrPath);

    created.push(api as unknown as { path: string });

    return api;
  }) as typeof LiveAPI.from;

  try {
    await mcp_request("req-1", tool, JSON.stringify(args));
  } finally {
    LiveAPI.from = originalFrom;
  }

  return created;
}

describe("request scope", () => {
  it("clears the path of every object the tool built", async () => {
    const created = await requestBuilding("ppal-live-api", {
      path: String(livePath.track(0)),
      operations: [{ type: "exists" }],
    });

    expect(created.length).toBeGreaterThan(0);
    expect(created.map((api) => api.path)).toStrictEqual(created.map(() => ""));
  });

  it("clears them even when the tool call fails", async () => {
    // A failed call armed the listeners just the same.
    const created = await requestBuilding("ppal-live-api", {
      path: String(livePath.track(0)),
      operations: [{ type: "get_property" }],
    });

    expect(created.length).toBeGreaterThan(0);
    expect(created.map((api) => api.path)).toStrictEqual(created.map(() => ""));
  });
});
