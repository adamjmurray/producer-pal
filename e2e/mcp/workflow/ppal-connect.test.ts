// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-connect tool
 * Uses once mode to reuse MCP connection across tests (faster).
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import { buildSkills } from "#src/skills/build-skills.ts";
import {
  parseToolResult,
  setConfig,
  setupMcpTestContext,
} from "../mcp-test-helpers";

const ctx = setupMcpTestContext({ once: true });

/** Helper to call ppal-connect and parse the result */
async function callConnect(): Promise<ConnectResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-connect",
    arguments: {},
  });

  return parseToolResult<ConnectResult>(result);
}

describe("ppal-connect", () => {
  it("returns standard mode skills (smallModelMode=false)", async () => {
    // Ensure standard mode is active, with notation pinned so the assertion is
    // deterministic regardless of any notation left set by a prior test.
    await setConfig({ smallModelMode: false, notation: "barbeat" });
    const parsed = await callConnect();

    // Connection status
    expect(parsed.connected).toBe(true);
    expect(parsed.producerPalVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.abletonLiveVersion).toBeDefined();
    expect(typeof parsed.abletonLiveVersion).toBe("string");
    expect(parsed.abletonLiveVersion).toMatch(/^\d+\.\d+(\.\d+)?$/);

    // Live Set info
    expect(parsed.liveSet).toBeDefined();
    expect(typeof parsed.liveSet.regularTrackCount).toBe("number");
    expect(typeof parsed.liveSet.returnTrackCount).toBe("number");
    expect(typeof parsed.liveSet.sceneCount).toBe("number");
    expect(parsed.liveSet.tempo).toBeDefined();
    expect(
      parsed.liveSet.timeSignature === null ||
        /^\d+\/\d+$/.test(parsed.liveSet.timeSignature),
    ).toBe(true);

    // Standard mode returns the assembled standard skills verbatim. Asserting
    // equality with buildSkills() (rather than hand-picked content markers like
    // section headings) means any future skills reorg flows through
    // automatically — this test can never silently drift out of sync with the
    // skills, which is exactly the failure that hardcoded markers caused before.
    expect(parsed.skills).toBe(buildSkills({ notation: "barbeat" }));
  });

  it("returns simplified skills (smallModelMode=true)", async () => {
    // Enable small model mode, notation pinned (see standard-mode test above).
    await setConfig({ smallModelMode: true, notation: "barbeat" });
    const parsed = await callConnect();

    // Connection status still works
    expect(parsed.connected).toBe(true);
    expect(parsed.producerPalVersion).toMatch(/^\d+\.\d+\.\d+$/);

    // Small model mode returns the notation's basic skills verbatim — and,
    // crucially, something different from standard mode, proving the mode
    // switch actually changed what the live server serves.
    expect(parsed.skills).toBe(
      buildSkills({ notation: "barbeat", smallModelMode: true }),
    );
    expect(parsed.skills).not.toBe(buildSkills({ notation: "barbeat" }));
  });

  describe("memory contents", () => {
    const TEST_NOTES = "Test memory content for e2e testing";

    it("includes memory when content is non-empty", async () => {
      await setConfig({ memoryContent: TEST_NOTES });
      const parsed = await callConnect();

      expect(parsed.memoryContent).toBe(TEST_NOTES);
    });

    it("excludes memory when content is empty", async () => {
      await setConfig({ memoryContent: "" });
      const parsed = await callConnect();

      expect(parsed.memoryContent).toBeUndefined();
    });
  });
});

/**
 * Type for ppal-connect result (matches connect.ts)
 */
interface ConnectResult {
  connected: boolean;
  producerPalVersion: string;
  abletonLiveVersion: string;
  liveSet: {
    name?: string;
    tempo: number;
    timeSignature: string | null;
    sceneCount: number;
    regularTrackCount: number;
    returnTrackCount: number;
    isPlaying?: boolean;
    scale?: string;
    scalePitches?: string;
  };
  skills?: string;
  memoryContent?: string;
}
