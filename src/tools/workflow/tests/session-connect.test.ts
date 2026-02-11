// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/version.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { setupConnectMocks } from "../connect-test-helpers.ts";
import { session } from "../session.ts";

// Mock the getHostTrackIndex function
vi.mock(
  import("#src/tools/shared/arrangement/get-host-track-index.ts"),
  () => ({
    getHostTrackIndex: vi.fn(() => 1), // Default to track index 1
  }),
);

describe("session - connect action", () => {
  it("defaults to connect action when no action specified", () => {
    setupConnectMocks({ liveSetName: "Default Test" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = session({});

    expect(result).toHaveProperty("connected", true);
    expect(result).toHaveProperty("producerPalVersion", VERSION);
    expect(result).toHaveProperty("abletonLiveVersion");
  });

  it("returns connection status with explicit connect action", () => {
    setupConnectMocks({ liveSetName: "Explicit Test" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = session({ action: "connect" });

    expect(result).toHaveProperty("connected", true);
    expect(result).toHaveProperty("producerPalVersion", VERSION);
    expect(result).toHaveProperty("abletonLiveVersion");
    expect(result).toHaveProperty("liveSet");
  });

  it("includes project notes when enabled via connect", () => {
    setupConnectMocks({ liveSetName: "Project with Notes" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const context: Partial<ToolContext> = {
      projectNotes: {
        enabled: true,
        writable: false,
        content: "Working on a house track",
      },
    };

    const result = session({ action: "connect" }, context);

    expect(result).toHaveProperty("memoryContent", "Working on a house track");
  });

  it("excludes project notes when disabled via connect", () => {
    setupConnectMocks({ liveSetName: "Project without Notes" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const context: Partial<ToolContext> = {
      projectNotes: {
        enabled: false,
        writable: false,
        content: "Should not be included",
      },
    };

    const result = session({ action: "connect" }, context);

    expect(result).not.toHaveProperty("memoryContent");
  });

  it("includes skills and instructions in connect result", () => {
    setupConnectMocks({ liveSetName: "Skills Test" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = session({ action: "connect" });

    expect(result).toHaveProperty("$skills");
    expect(result).toHaveProperty("$instructions");
    expect(result).toHaveProperty("messagesForUser");
  });
});
