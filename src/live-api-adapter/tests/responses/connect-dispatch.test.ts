// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// ppal-connect takes `versionCheck` from the tool args and answers with the
// versions alone, never reading the Live Set.

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";

vi.mock(import("#src/live-api-adapter/project-context-sync.ts"), () => ({
  backupProjectContextOnEdit: vi.fn(),
  noteProjectContextLoaded: vi.fn(),
  syncProjectContextBackup: vi.fn(),
  resetProjectContextSyncMemo: vi.fn(),
}));

const { mcp_request } =
  await import("#src/live-api-adapter/live-api-adapter.ts");

/**
 * Run ppal-connect through the adapter.
 *
 * @param args - The tool args
 * @returns The text of the first content block of the response
 */
async function connectWith(args: object): Promise<string> {
  registerMockObject("live_app", {
    path: "live_app",
    type: "Application",
    methods: { get_version_string: () => "12.5" },
  });
  registerMockObject("live_set", {
    path: livePath.liveSet,
    type: "Song",
    properties: { tracks: [], return_tracks: [], scenes: [], tempo: 120 },
  });

  await mcp_request("req-1", "ppal-connect", JSON.stringify(args));

  const call = vi
    .mocked(outlet)
    .mock.calls.findLast(
      ([outletIndex, message]) =>
        outletIndex === 0 && message === "mcp_response",
    );
  const response = JSON.parse((call ?? []).slice(3, -1).join("")) as {
    content: Array<{ text: string }>;
  };

  return response.content[0]?.text ?? "";
}

describe("ppal-connect dispatch", () => {
  it("answers a version check with the versions and no Live Set", async () => {
    const result = await connectWith({ versionCheck: true });

    expect(result).toMatch(
      /^\{connected:true,producerPalVersion:"[^"]+",abletonLiveVersion:"12\.5"\}$/,
    );
  });

  it.each([{}, { versionCheck: false }])(
    "answers %j with the Live Set overview",
    async (args) => {
      expect(await connectWith(args)).toContain("liveSet");
    },
  );
});
