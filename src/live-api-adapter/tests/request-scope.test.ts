// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Every Max entry point releases the LiveAPI objects it built, so Live's path
// listeners don't outlive the request. See live-api-release.ts.

import { describe, expect, it, vi } from "vitest";
import { MIN_LIVE_VERSION } from "#src/shared/config.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

vi.mock(import("#src/live-api-adapter/project-context-sync.ts"), () => ({
  backupProjectContextOnEdit: vi.fn(),
  noteProjectContextLoaded: vi.fn(),
  syncProjectContextBackup: vi.fn(),
  resetProjectContextSyncMemo: vi.fn(),
}));

const { backupProjectContextOnEdit } =
  await import("#src/live-api-adapter/project-context-sync.ts");

const { checkLiveVersion, mcp_request, projectContext } =
  await import("#src/live-api-adapter/live-api-adapter.ts");

/**
 * Collect every LiveAPI object built while `run` executes.
 *
 * @param run - The work to run
 * @returns The objects it built
 */
async function objectsBuiltBy(
  run: () => void | Promise<void>,
): Promise<{ path: string }[]> {
  const created: { path: string }[] = [];
  const originalFrom = LiveAPI.from.bind(LiveAPI);

  LiveAPI.from = ((idOrPath: Parameters<typeof LiveAPI.from>[0]) => {
    const api = originalFrom(idOrPath);

    created.push(api as unknown as { path: string });

    return api;
  }) as typeof LiveAPI.from;

  try {
    await run();
  } finally {
    LiveAPI.from = originalFrom;
  }

  return created;
}

/**
 * Assert the run built objects and left every one of them released.
 *
 * @param created - The objects the run built
 */
function expectAllReleased(created: { path: string }[]): void {
  expect(created.length).toBeGreaterThan(0);
  expect(created.map((api) => api.path)).toStrictEqual(created.map(() => ""));
}

/**
 * The MCP response the last request sent back out outlet 0.
 *
 * @returns The reassembled response JSON
 */
function lastResponseJson(): string {
  const call = vi
    .mocked(outlet)
    .mock.calls.findLast(
      ([outletIndex, message]) =>
        outletIndex === 0 && message === "mcp_response",
    );

  // ["mcp_response", requestId, ...chunks, delimiter]
  return (call ?? []).slice(3, -1).join("");
}

describe("request scope", () => {
  it("clears the path of every object the tool built", async () => {
    const created = await objectsBuiltBy(() =>
      mcp_request(
        "req-1",
        "ppal-live-api",
        JSON.stringify({
          path: String(livePath.track(0)),
          operations: [{ type: "exists" }],
        }),
      ),
    );

    expectAllReleased(created);
  });

  it("clears them even when the tool call fails", async () => {
    // A failed call armed the listeners just the same. `get_property` with no
    // `property` fails validation — assert the response really is the error,
    // or a change that stops it throwing turns this into the test above.
    const created = await objectsBuiltBy(() =>
      mcp_request(
        "req-1",
        "ppal-live-api",
        JSON.stringify({
          path: String(livePath.track(0)),
          operations: [{ type: "get_property" }],
        }),
      ),
    );

    expect(lastResponseJson()).toContain('"isError":true');
    expect(lastResponseJson()).toContain("requires property");
    expectAllReleased(created);
  });
});

// A device-UI or webui context edit reaches V8 through the param setter, never
// through a tool call, so it has to close its own scope. Otherwise every
// autosave arms another live_set listener that only some later tool call sweeps.
describe("project-context setter scope", () => {
  it("clears the path of the object the on-disk backup built", () => {
    let liveSet: { path: string } | undefined;

    // Stands in for the real backup's readLiveSetFilePath(), which builds this
    // object before the first await — so the setter's scope covers it.
    vi.mocked(backupProjectContextOnEdit).mockImplementation(async () => {
      liveSet = LiveAPI.from(livePath.liveSet) as unknown as { path: string };

      await Promise.resolve();
    });

    // The session's first set is the device's load echo and never backs up.
    projectContext("the blob the device loaded with");
    projectContext("a genuine edit");

    expect(liveSet?.path).toBe("");
  });
});

// The patch bangs this at device load, outside any tool call, so it has to
// close its own scope too.
describe("live-version check scope", () => {
  it("clears the path of the live_app object it built", async () => {
    registerMockObject("live_app", {
      path: "live_app",
      type: "Application",
      methods: { get_version_string: () => "12.2" },
    });

    const created = await objectsBuiltBy(() => checkLiveVersion());

    expect(vi.mocked(outlet).mock.calls).toContainEqual([
      0,
      "min_live_version_not_met",
      "12.2",
      MIN_LIVE_VERSION,
    ]);
    expectAllReleased(created);
  });
});
