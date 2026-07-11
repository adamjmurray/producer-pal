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
  it("does not embed the per-project context blob in the result", () => {
    // Project context used to ride along as result.memoryContent. It now ships
    // as its own labeled connect block, injected Node-side (withProjectContext),
    // so the V8 result must stay context-free — the same shape as global context
    // and the memory index.
    setupConnectMocks({ liveSetName: "Project with Notes" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect({}) as unknown as Record<string, unknown>;

    expect(result.memoryContent).toBeUndefined();
  });

  it("does not build the skills blob (assembled Node-side, not in V8)", () => {
    // Skills moved out of the V8 connect() body: the override files live only on
    // the Node-for-Max side, so buildSkills runs there and is injected into the
    // ppal-connect result (see skills-inject.ts). connect() must stay skills-free.
    setupConnectMocks();
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect({}) as { skills?: unknown };

    expect(result.skills).toBeUndefined();
  });
});
