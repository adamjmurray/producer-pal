/**
 * E2E tests for ppal-connect tool
 * Requires a running Producer Pal MCP server (Ableton Live + device active)
 *
 * Run with: npm run e2e:mcp
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, describe, expect, it } from "vitest";
import {
  connectMcp,
  extractToolResultText,
  type McpConnection,
} from "#evals/chat/shared/mcp.ts";

const MCP_URL = process.env.MCP_URL ?? "http://localhost:3350/mcp";

// Connect at module load time (top-level await)
const connection: McpConnection = await connectMcp(MCP_URL);
const client: Client = connection.client;

afterAll(async () => {
  await client.close();
});

/**
 * Parse the compact JS literal format used by Producer Pal to save tokens.
 * Uses eval since the format is valid JS but not valid JSON (unquoted keys).
 * Safe here since we're only parsing trusted MCP server responses in local tests.
 */
function parseCompactJSLiteral<T>(text: string): T {
  // eslint-disable-next-line no-eval -- Parsing trusted MCP server response in local e2e test
  return eval(`(${text})`) as T;
}

describe("ppal-connect", () => {
  it("connects to Ableton Live and returns connection info", async () => {
    const result = await client.callTool({
      name: "ppal-connect",
      arguments: {},
    });

    const text = extractToolResultText(result);
    const parsed = parseCompactJSLiteral<ConnectResult>(text);

    // Verify required fields
    expect(parsed.connected).toBe(true);
    expect(parsed.producerPalVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parsed.abletonLiveVersion).toBeDefined();
    expect(typeof parsed.abletonLiveVersion).toBe("string");

    // Verify liveSet structure
    expect(parsed.liveSet).toBeDefined();
    expect(typeof parsed.liveSet.trackCount).toBe("number");
    expect(typeof parsed.liveSet.sceneCount).toBe("number");
    expect(parsed.liveSet.tempo).toBeDefined();

    // timeSignature can be null or a string like "4/4"
    expect(
      parsed.liveSet.timeSignature === null ||
        /^\d+\/\d+$/.test(parsed.liveSet.timeSignature),
    ).toBe(true);

    // Verify optional skill documentation fields
    expect(parsed.$skills).toBeDefined();
    expect(parsed.$instructions).toBeDefined();
    expect(parsed.messagesForUser).toBeDefined();
  });

  it("returns Producer Pal Skills documentation", async () => {
    const result = await client.callTool({
      name: "ppal-connect",
      arguments: {},
    });

    const text = extractToolResultText(result);
    const parsed = parseCompactJSLiteral<ConnectResult>(text);

    expect(parsed.$skills).toContain("Producer Pal Skills");
  });

  it("returns initialization instructions", async () => {
    const result = await client.callTool({
      name: "ppal-connect",
      arguments: {},
    });

    const text = extractToolResultText(result);
    const parsed = parseCompactJSLiteral<ConnectResult>(text);

    expect(parsed.$instructions).toContain("ppal-read-live-set");
  });

  it("returns messages for the user", async () => {
    const result = await client.callTool({
      name: "ppal-connect",
      arguments: {},
    });

    const text = extractToolResultText(result);
    const parsed = parseCompactJSLiteral<ConnectResult>(text);

    // Messages should include connection confirmation and tips
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
