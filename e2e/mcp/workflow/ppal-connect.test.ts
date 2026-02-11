// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for ppal-session tool (connect action)
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

/** Helper to call ppal-session with connect action and parse the result */
async function callConnect(): Promise<ConnectResult> {
  const result = await ctx.client!.callTool({
    name: "ppal-session",
    arguments: { action: "connect" },
  });

  return parseToolResult<ConnectResult>(result);
}

describe("ppal-session (connect action)", () => {
  it("returns standard mode skills and instructions (smallModelMode=false)", async () => {
    // Ensure standard mode is active
    await setConfig({ smallModelMode: false });
    const parsed = await callConnect();

    // Connection status
    expect(parsed.connected).toBe(true);
    expect(parsed.producerPalVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.abletonLiveVersion).toBeDefined();
    expect(typeof parsed.abletonLiveVersion).toBe("string");

    // Live Set info
    expect(parsed.liveSet).toBeDefined();
    expect(typeof parsed.liveSet.trackCount).toBe("number");
    expect(typeof parsed.liveSet.sceneCount).toBe("number");
    expect(parsed.liveSet.tempo).toBeDefined();
    expect(
      parsed.liveSet.timeSignature === null ||
        /^\d+\/\d+$/.test(parsed.liveSet.timeSignature),
    ).toBe(true);

    // Skills documentation - standard mode has full skills (~7.6K chars)
    expect(parsed.$skills).toBeDefined();
    expect(parsed.$skills).toContain("Producer Pal Skills");
    expect(parsed.$skills!.length).toBeGreaterThan(5000);

    // Standard mode includes advanced features
    expect(parsed.$skills).toContain("x{times}"); // Repeat patterns
    expect(parsed.$skills).toMatch(/v0[^-]/); // v0 deletion (not v0-127 range)
    expect(parsed.$skills).toMatch(/p0\./); // Probability with decimal
    expect(parsed.$skills).toContain("/d0"); // Device paths

    // Instructions - standard mode mentions ppal-read-live-set
    expect(parsed.$instructions).toBeDefined();
    expect(parsed.$instructions).toContain("ppal-read-live-set");

    // User messages
    expect(parsed.messagesForUser).toBeDefined();
    expect(parsed.messagesForUser).toContain("connected to Ableton Live");
    expect(parsed.messagesForUser).toContain("Save often");
  });

  it("returns simplified skills and instructions (smallModelMode=true)", async () => {
    // Enable small model mode
    await setConfig({ smallModelMode: true });
    const parsed = await callConnect();

    // Connection status still works
    expect(parsed.connected).toBe(true);
    expect(parsed.producerPalVersion).toMatch(/^\d+\.\d+\.\d+$/);

    // Skills documentation - small model mode has simplified skills (~1.6K chars)
    expect(parsed.$skills).toBeDefined();
    expect(parsed.$skills).toContain("Producer Pal Skills");
    expect(parsed.$skills!.length).toBeLessThan(2000);

    // Small model mode excludes advanced features
    expect(parsed.$skills).not.toContain("x{times}"); // No repeat patterns
    expect(parsed.$skills).not.toMatch(/v0[^-]/); // No v0 deletion
    expect(parsed.$skills).not.toMatch(/p0\./); // No probability
    expect(parsed.$skills).not.toContain("/d0"); // No device paths

    // Basic features are still present
    expect(parsed.$skills).toContain("bar|beat");
    expect(parsed.$skills).toContain("Melodies");

    // Instructions - small model mode does NOT mention ppal-read-live-set
    expect(parsed.$instructions).toBeDefined();
    expect(parsed.$instructions).not.toContain("ppal-read-live-set");

    // User messages still work
    expect(parsed.messagesForUser).toBeDefined();
    expect(parsed.messagesForUser).toContain("connected to Ableton Live");
  });

  describe("memory contents", () => {
    const TEST_NOTES = "Test project notes content for e2e testing";

    it("excludes projectNotes when disabled (default)", async () => {
      await setConfig({ memoryEnabled: false, memoryContent: "" });
      const parsed = await callConnect();

      expect(parsed.memoryContent).toBeUndefined();
      expect(parsed.$instructions).not.toContain("project notes");
    });

    it("includes projectNotes when enabled with content (read-only)", async () => {
      await setConfig({
        memoryEnabled: true,
        memoryContent: TEST_NOTES,
        memoryWritable: false,
      });
      const parsed = await callConnect();

      expect(parsed.memoryContent).toBe(TEST_NOTES);
      expect(parsed.$instructions).toContain("Summarize the project notes");
      expect(parsed.$instructions).not.toContain("update the project notes");
    });

    it("includes writable instruction when memoryWritable is true", async () => {
      await setConfig({
        memoryEnabled: true,
        memoryContent: TEST_NOTES,
        memoryWritable: true,
      });
      const parsed = await callConnect();

      expect(parsed.memoryContent).toBe(TEST_NOTES);
      expect(parsed.$instructions).toContain("Summarize the project notes");
      expect(parsed.$instructions).toContain("update the project notes");
    });

    it("excludes projectNotes when enabled but content is empty", async () => {
      await setConfig({
        memoryEnabled: true,
        memoryContent: "",
        memoryWritable: false,
      });
      const parsed = await callConnect();

      expect(parsed.memoryContent).toBeUndefined();
      expect(parsed.$instructions).not.toContain("project notes");
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
    trackCount: number;
    sceneCount: number;
    tempo: number;
    timeSignature: string | null;
    scale?: string;
  };
  $skills?: string;
  $instructions?: string;
  messagesForUser?: string;
  memoryContent?: string;
}
