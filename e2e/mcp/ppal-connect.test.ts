/**
 * E2E tests for ppal-connect tool
 * Automatically opens the basic-midi-4-track Live Set before each test.
 *
 * Run with: npm run e2e:mcp
 */
import { describe, expect, it } from "vitest";
import {
  extractToolResultText,
  parseCompactJSLiteral,
  setupMcpTestContext,
} from "./mcp-test-helpers";

const ctx = setupMcpTestContext();

describe("ppal-connect", () => {
  it("connects to Ableton Live and returns expected response", async () => {
    const result = await ctx.client!.callTool({
      name: "ppal-connect",
      arguments: {},
    });

    const text = extractToolResultText(result);
    const parsed = parseCompactJSLiteral<ConnectResult>(text);

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

    // Skills documentation
    expect(parsed.$skills).toBeDefined();
    expect(parsed.$skills).toContain("Producer Pal Skills");

    // Instructions
    expect(parsed.$instructions).toBeDefined();
    expect(parsed.$instructions).toContain("ppal-read-live-set");

    // User messages
    expect(parsed.messagesForUser).toBeDefined();
    expect(parsed.messagesForUser).toContain("connected to Ableton Live");
    expect(parsed.messagesForUser).toContain("Save often");
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
  projectNotes?: string;
}
