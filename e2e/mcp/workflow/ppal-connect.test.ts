// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-connect tool
 * Uses once mode to reuse MCP connection across tests (faster).
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
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
    // Ensure standard mode is active
    await setConfig({ smallModelMode: false });
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

    // Skills documentation - standard mode has full skills (~7.6K chars)
    expect(parsed.skills).toBeDefined();
    expect(parsed.skills).toContain("Producer Pal Skills");
    expect(parsed.skills!.length).toBeGreaterThan(5000);

    // Standard mode includes advanced features
    expect(parsed.skills).toContain("@N="); // bar copying
    expect(parsed.skills).toContain("v0 C3 1|1"); // v0 deletion
    expect(parsed.skills).toContain("## Techniques"); // advanced section
  });

  it("returns simplified skills (smallModelMode=true)", async () => {
    // Enable small model mode
    await setConfig({ smallModelMode: true });
    const parsed = await callConnect();

    // Connection status still works
    expect(parsed.connected).toBe(true);
    expect(parsed.producerPalVersion).toMatch(/^\d+\.\d+\.\d+$/);

    // Skills documentation - small model mode has simplified skills (~4.2K chars)
    expect(parsed.skills).toBeDefined();
    expect(parsed.skills).toContain("Producer Pal Skills");
    expect(parsed.skills!.length).toBeLessThan(5000);

    // Small model mode excludes the advanced features the standard tier asserts
    // it contains (see standard-mode test above). The basic tier does document
    // preTransforms `v0`/`pN`, so only standard-only markers are excluded here.
    expect(parsed.skills).not.toContain("@N="); // No bar copying
    expect(parsed.skills).not.toContain("v0 C3 1|1"); // No inline note deletion
    expect(parsed.skills).not.toContain("## Techniques"); // No advanced section
    expect(parsed.skills).not.toContain("/d0"); // No device paths

    // Basic features are still present
    expect(parsed.skills).toContain("bar|beat");
    expect(parsed.skills).toContain("Melody");
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
