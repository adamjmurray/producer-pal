import { describe, expect, it, vi } from "vitest";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { setupConnectMocks } from "./connect-test-helpers.ts";
import { connect } from "./connect.ts";

// Mock the getHostTrackIndex function
vi.mock(
  import("#src/tools/shared/arrangement/get-host-track-index.ts"),
  () => ({
    getHostTrackIndex: vi.fn(() => 1), // Default to track index 1
  }),
);

describe("connect", () => {
  it("includes project notes when enabled (read-only)", () => {
    setupConnectMocks({ liveSetName: "Project with Notes" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const context: Partial<ToolContext> = {
      projectNotes: {
        enabled: true,
        writable: false,
        content: "Working on a house track with heavy bass",
      },
    };

    const result = connect({}, context);

    expect(result.projectNotes).toStrictEqual(
      "Working on a house track with heavy bass",
    );
    expect(result.$instructions).toContain("Summarize the project notes");
    expect(result.$instructions).toContain(
      "follow instructions in project notes",
    );
    expect(result.$instructions).not.toContain(
      "mention you can update the project notes",
    );
  });

  it("includes project notes when writable", () => {
    setupConnectMocks({ liveSetName: "Project with Notes" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const context: Partial<ToolContext> = {
      projectNotes: {
        enabled: true,
        writable: true,
        content: "Working on a house track with heavy bass",
      },
    };

    const result = connect({}, context);

    expect(result.projectNotes).toStrictEqual(
      "Working on a house track with heavy bass",
    );
    expect(result.$instructions).toContain("Summarize the project notes");
    expect(result.$instructions).toContain(
      "follow instructions in project notes",
    );
    expect(result.$instructions).toContain(
      "mention you can update the project notes",
    );
  });

  it("excludes project notes when context is disabled", () => {
    setupConnectMocks({ liveSetName: "Project without Notes" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const context: Partial<ToolContext> = {
      projectNotes: {
        enabled: false,
        writable: false,
        content: "Should not be included",
      },
    };

    const result = connect({}, context);

    expect(result.projectNotes).toBeUndefined();
  });

  it("handles missing context gracefully", () => {
    setupConnectMocks({ liveSetName: "No Context Project" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    expect(result.projectNotes).toBeUndefined();
  });

  it("returns standard skills and instructions by default", () => {
    setupConnectMocks();
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    expect(result.$skills).toContain("Producer Pal Skills");
    expect(result.$skills).toContain("## Techniques");
    expect(result.$instructions).toContain(
      "Call ppal-read-live-set _with no arguments_",
    );
  });

  it("returns basic skills and instructions when smallModelMode is enabled", () => {
    setupConnectMocks({ liveSetName: "Small Model Project" });
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const context: Partial<ToolContext> = {
      smallModelMode: true,
    };

    const result = connect({}, context);

    expect(result.$skills).toContain("Producer Pal Skills");
    expect(result.$skills).not.toContain("## Techniques");
    expect(result.$instructions).not.toContain("Call ppal-read-live-set");
    expect(result.$instructions).toContain("Summarize the Live Set");
  });

  it("standard skills include advanced features that basic skills omit", () => {
    setupConnectMocks();
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const standardResult = connect({}, {});
    const basicResult = connect({}, { smallModelMode: true });

    // Standard includes advanced features
    expect(standardResult.$skills).toContain("@N="); // bar copying
    expect(standardResult.$skills).toContain("v0 C3 1|1"); // v0 deletion
    expect(standardResult.$skills).toContain("## Techniques");
    expect(standardResult.$skills).toContain("**Creating Music:**");
    expect(standardResult.$skills).toContain("velocity dynamics");
    expect(standardResult.$skills).toContain("routeToSource");

    // Basic omits advanced features
    expect(basicResult.$skills).not.toContain("@N=");
    expect(basicResult.$skills).not.toContain("v0 C3 1|1");
    expect(basicResult.$skills).not.toContain("## Techniques");
    expect(basicResult.$skills).not.toContain("**Creating Music:**");
    expect(basicResult.$skills).not.toContain("velocity dynamics");
    expect(basicResult.$skills).not.toContain("routeToSource");
  });

  it("standard instructions include ppal-read-live-set call", () => {
    setupConnectMocks();
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const standardResult = connect({}, {});
    const basicResult = connect({}, { smallModelMode: true });

    // Standard includes explicit call to ppal-read-live-set
    expect(standardResult.$instructions).toContain(
      "Call ppal-read-live-set _with no arguments_",
    );
    expect(standardResult.$instructions).toContain(
      "if ppal-read-live-set fails",
    );

    // Basic omits ppal-read-live-set call
    expect(basicResult.$instructions).not.toContain("ppal-read-live-set");

    // Both include common instructions
    expect(standardResult.$instructions).toContain("Summarize the Live Set");
    expect(standardResult.$instructions).toContain("messagesForUser");
    expect(basicResult.$instructions).toContain("Summarize the Live Set");
    expect(basicResult.$instructions).toContain("messagesForUser");
  });
});
