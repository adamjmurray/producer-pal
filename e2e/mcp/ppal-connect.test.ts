/**
 * E2E tests for ppal-connect tool
 * Automatically opens the basic-midi-4-track Live Set before each test.
 *
 * Run with: npm run e2e:mcp
 */
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  connectMcp,
  extractToolResultText,
  type McpConnection,
} from "#evals/chat/shared/mcp.ts";
import { openLiveSet } from "#evals/eval/open-live-set.ts";

const MCP_URL = process.env.MCP_URL ?? "http://localhost:3350/mcp";
const LIVE_SET_PATH =
  "evals/live-sets/basic-midi-4-track Project/basic-midi-4-track.als";

let connection: McpConnection;
let client: Client;

beforeEach(async () => {
  await openLiveSet(LIVE_SET_PATH);
  connection = await connectMcp(MCP_URL);
  client = connection.client;
});

afterEach(async () => {
  await client?.close();
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
  it("connects to Ableton Live and returns expected response", async () => {
    const result = await client.callTool({
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
