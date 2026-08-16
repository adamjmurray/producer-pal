// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for what a deprecated param publishes.
 *
 * deprecatedParam() keeps a param in the schema that validates and out of the
 * schema that ships, so old callers keep working while the model never learns
 * the old name. Unit tests cover the framework against a mock server; only a
 * real listTools() shows what a client actually receives.
 *
 * The other half — that the retired names still work — is covered where the
 * clips are: ppal-duplicate and ppal-update-clip each pin a toSlot call.
 *
 * Run with: npm run e2e:mcp -- deprecated-params
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectMcp, type McpConnection } from "#evals/chat/mcp.ts";
import { MCP_URL } from "../mcp-test-helpers";

interface ToolInfo {
  name: string;
  inputSchema: { properties?: Record<string, unknown> };
}

let connection: McpConnection | null = null;
let client: Client | null = null;
let tools: ToolInfo[] = [];

beforeAll(async () => {
  connection = await connectMcp(MCP_URL);
  client = connection.client;
  tools = (await client.listTools()).tools as ToolInfo[];
});

afterAll(async () => {
  await client?.close();
});

/**
 * Read a published tool's param names.
 * @param toolName - Tool to look up
 * @returns Every param the model is shown
 */
function publishedParams(toolName: string): string[] {
  const tool = tools.find((t) => t.name === toolName);

  expect(tool, `tool ${toolName} not found`).toBeDefined();

  return Object.keys(tool!.inputSchema.properties ?? {});
}

describe("deprecated params", () => {
  it("publishes toPath and hides the destination params it replaced", () => {
    const duplicate = publishedParams("ppal-duplicate");

    expect(duplicate).toContain("toPath");
    expect(duplicate).not.toContain("toSlot");
    // toTrack was never released — it existed only between the fix and this
    // unification, so it should be absent everywhere, not merely deprecated.
    expect(duplicate).not.toContain("toTrack");

    const updateClip = publishedParams("ppal-update-clip");

    expect(updateClip).toContain("toPath");
    expect(updateClip).not.toContain("toSlot");
  });
});
