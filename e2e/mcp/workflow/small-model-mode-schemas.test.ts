// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E tests for small model mode schema filtering.
 * Verifies that excludeEnumValues removes enum options from tool schemas.
 *
 * Run with: npm run e2e:mcp -- small-model-mode-schemas
 */
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectMcp, type McpConnection } from "#evals/chat/ai-sdk-mcp.ts";
import { resetConfig, setConfig } from "#evals/shared/config.ts";
import { MCP_URL } from "../mcp-test-helpers";

/** Connect with small model mode enabled */
let connection: McpConnection | null = null;
let client: Client | null = null;
let tools: ToolInfo[] = [];

interface ToolInfo {
  name: string;
  inputSchema: {
    properties?: Record<
      string,
      { items?: { enum?: string[] }; description?: string }
    >;
  };
}

beforeAll(async () => {
  await setConfig({ smallModelMode: true });
  connection = await connectMcp(MCP_URL);
  client = connection.client;
  const result = await client.listTools();

  tools = result.tools as ToolInfo[];
});

afterAll(async () => {
  await client?.close();
  await resetConfig();
});

/** Get a tool's include enum values from the schema */
function getIncludeEnum(toolName: string): string[] {
  const tool = tools.find((t) => t.name === toolName);

  expect(tool, `tool ${toolName} not found`).toBeDefined();

  return tool!.inputSchema.properties?.include?.items?.enum ?? [];
}

/** Get a tool's param description */
function getParamDescription(
  toolName: string,
  paramName: string,
): string | undefined {
  const tool = tools.find((t) => t.name === toolName);

  return tool?.inputSchema.properties?.[paramName]?.description;
}

describe("small model mode schema filtering", () => {
  it("read-track excludes available-routings from include", () => {
    const includeValues = getIncludeEnum("ppal-read-track");

    expect(includeValues).not.toContain("available-routings");
    expect(includeValues).toContain("session-clips");
    expect(includeValues).toContain("arrangement-clips");
    expect(includeValues).toContain("devices");
    expect(includeValues).toContain("routings");
  });

  it("read-device excludes drum-pads and return-chains from include", () => {
    const includeValues = getIncludeEnum("ppal-read-device");

    expect(includeValues).not.toContain("drum-pads");
    expect(includeValues).not.toContain("return-chains");
    expect(includeValues).toContain("chains");
    expect(includeValues).toContain("params");
    expect(includeValues).toContain("drum-map");
  });

  it("read-device maxDepth description omits drum-pads", () => {
    const desc = getParamDescription("ppal-read-device", "maxDepth");

    expect(desc).toBeDefined();
    expect(desc).not.toContain("drum-pads");
    expect(desc).toContain("chains");
  });

  it("read-live-set excludes locators from include", () => {
    const includeValues = getIncludeEnum("ppal-read-live-set");

    expect(includeValues).not.toContain("locators");
    expect(includeValues).toContain("tracks");
    expect(includeValues).toContain("scenes");
  });

  it("read-clip excludes warp from include", () => {
    const includeValues = getIncludeEnum("ppal-read-clip");

    expect(includeValues).not.toContain("warp");
    expect(includeValues).toContain("notes");
    expect(includeValues).toContain("timing");
    expect(includeValues).toContain("sample");
  });
});
