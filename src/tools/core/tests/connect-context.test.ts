// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { setupConnectMocks } from "./connect-test-helpers.ts";
import { connect } from "../connect.ts";

// Mock the getHostTrackIndex function
vi.mock(
  import("#src/tools/shared/arrangement/get-host-track-index.ts"),
  () => ({
    getHostTrackIndex: vi.fn(() => 1), // Default to track index 1
  }),
);

describe("connect", () => {
  it("includes memory content when non-empty", () => {
    setupConnectMocks({ liveSetName: "Project with Notes" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const context: Partial<ToolContext> = {
      memory: { content: "Working on a house track with heavy bass" },
    };

    const result = connect({}, context);

    expect(result.memoryContent).toStrictEqual(
      "Working on a house track with heavy bass",
    );
  });

  it("excludes memory when content is empty", () => {
    setupConnectMocks({ liveSetName: "Empty Memory Project" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const context: Partial<ToolContext> = {
      memory: { content: "" },
    };

    const result = connect({}, context);

    expect(result.memoryContent).toBeUndefined();
  });

  it("handles missing context gracefully", () => {
    setupConnectMocks({ liveSetName: "No Context Project" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    expect(result.memoryContent).toBeUndefined();
  });

  it("does not build the skills blob (assembled Node-side, not in V8)", () => {
    // Skills moved out of the V8 connect() body: the override files live only on
    // the Node-for-Max side, so buildSkills runs there and is injected into the
    // ppal-connect result (see skills-inject.ts). connect() must stay skills-free.
    setupConnectMocks();
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect({}, { smallModelMode: true }) as {
      skills?: unknown;
    };

    expect(result.skills).toBeUndefined();
  });
});
