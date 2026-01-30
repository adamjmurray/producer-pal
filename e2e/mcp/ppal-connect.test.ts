/**
 * E2E tests for ppal-connect tool
 * Automatically opens the basic-midi-4-track Live Set before each test.
 *
 * Run with: npm run e2e:mcp
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  extractToolResultText,
  MCP_URL,
  parseCompactJSLiteral,
  setupMcpTestContext,
} from "./mcp-test-helpers";

const ctx = setupMcpTestContext();

/**
 * Get the config endpoint URL from the MCP URL
 */
function getConfigUrl(): string {
  return MCP_URL.replace("/mcp", "/config");
}

/**
 * Set smallModelMode via the config endpoint
 */
async function setSmallModelMode(enabled: boolean): Promise<void> {
  const response = await fetch(getConfigUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ smallModelMode: enabled }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set smallModelMode: ${response.status}`);
  }
}

describe("ppal-connect", () => {
  // Ensure smallModelMode is reset after each test
  afterEach(async () => {
    await setSmallModelMode(false);
  });

  it("returns standard mode skills and instructions (smallModelMode=false)", async () => {
    // Ensure standard mode is active
    await setSmallModelMode(false);

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

    // Skills documentation - standard mode has full skills (~10K chars)
    expect(parsed.$skills).toBeDefined();
    expect(parsed.$skills).toContain("Producer Pal Skills");
    expect(parsed.$skills!.length).toBeGreaterThan(8000);

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
    await setSmallModelMode(true);

    const result = await ctx.client!.callTool({
      name: "ppal-connect",
      arguments: {},
    });

    const text = extractToolResultText(result);
    const parsed = parseCompactJSLiteral<ConnectResult>(text);

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
