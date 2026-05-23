// Producer Pal
// Copyright (C) 2026 Adam Murray
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
  it("includes memory when enabled", () => {
    setupConnectMocks({ liveSetName: "Project with Notes" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const context: Partial<ToolContext> = {
      memory: {
        enabled: true,
        writable: false,
        content: "Working on a house track with heavy bass",
      },
    };

    const result = connect({}, context);

    expect(result.memoryContent).toStrictEqual(
      "Working on a house track with heavy bass",
    );
  });

  it("excludes memory when context is disabled", () => {
    setupConnectMocks({ liveSetName: "Project without Notes" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const context: Partial<ToolContext> = {
      memory: {
        enabled: false,
        writable: false,
        content: "Should not be included",
      },
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

  it("returns standard skills by default", () => {
    setupConnectMocks();
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    expect(result.skills).toContain("Producer Pal Skills");
    expect(result.skills).toContain("## Techniques");
  });

  it("returns basic skills when smallModelMode is enabled", () => {
    setupConnectMocks({ liveSetName: "Small Model Project" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect({}, { smallModelMode: true });

    expect(result.skills).toContain("Producer Pal Skills");
    expect(result.skills).not.toContain("## Techniques");
  });

  it("standard skills include advanced features that basic skills omit", () => {
    setupConnectMocks();
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const standardResult = connect({}, {});
    const basicResult = connect({}, { smallModelMode: true });

    // Standard includes advanced features
    expect(standardResult.skills).toContain("@N="); // bar copying
    expect(standardResult.skills).toContain("v0 C3 1|1"); // v0 deletion
    expect(standardResult.skills).toContain("## Techniques");
    expect(standardResult.skills).toContain("**Creating Music:**");
    expect(standardResult.skills).toContain("velocity dynamics");
    expect(standardResult.skills).toContain("routeToSource");

    // Basic omits advanced features
    expect(basicResult.skills).not.toContain("@N=");
    expect(basicResult.skills).not.toContain("v0 C3 1|1");
    expect(basicResult.skills).not.toContain("## Techniques");
    expect(basicResult.skills).not.toContain("**Creating Music:**");
    expect(basicResult.skills).not.toContain("velocity dynamics");
    expect(basicResult.skills).not.toContain("routeToSource");
  });
});
