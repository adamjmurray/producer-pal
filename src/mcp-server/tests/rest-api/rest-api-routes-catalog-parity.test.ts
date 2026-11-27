// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import {
  DISABLED_TOOLS_HEADER,
  LIVE_API_HEADER,
  SMALL_MODEL_MODE_HEADER,
} from "#src/shared/config.ts";
import { NOTATION_HEADER, type Notation } from "#src/shared/notation.ts";
import { ALL_TOOL_IDS } from "#src/shared/tool-groups.ts";
import { createMcpServer } from "#src/mcp-server/create-mcp-server.ts";
import { connectClient } from "#src/mcp-server/tests/server/mcp-client-test-helpers.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

// GET /api/tools must list each tool exactly as the device's tools/list does
// for the same profile, so a REST caller and an MCP client see one surface.

const appState = setupExpressAppServer();

interface Profile {
  notation: Notation;
  smallModelMode: boolean;
  liveApiEnabled: boolean;
  disabledTools?: string[];
}

const PROFILES: Profile[] = [
  ...(["barbeat", "stark", "midi-json"] as const).flatMap((notation) =>
    [false, true].flatMap((smallModelMode) =>
      [false, true].map((liveApiEnabled) => ({
        notation,
        smallModelMode,
        liveApiEnabled,
      })),
    ),
  ),
  {
    notation: "barbeat",
    smallModelMode: false,
    liveApiEnabled: true,
    disabledTools: ["ppal-playback", "ppal-live-api"],
  },
];

interface ListedTool {
  name: string;
  title?: string;
  description?: string;
  annotations?: object;
  inputSchema: object;
}

/**
 * @param profile - The request profile
 * @returns The catalog GET /api/tools serves for it
 */
async function restTools(profile: Profile): Promise<ListedTool[]> {
  const headers: Record<string, string> = {
    [NOTATION_HEADER]: profile.notation,
    [SMALL_MODEL_MODE_HEADER]: String(profile.smallModelMode),
    [LIVE_API_HEADER]: String(profile.liveApiEnabled),
  };

  if (profile.disabledTools != null) {
    headers[DISABLED_TOOLS_HEADER] = profile.disabledTools.join(",");
  }

  const response = await fetch(`${appState.baseUrl}/api/tools`, { headers });

  return ((await response.json()) as { tools: ListedTool[] }).tools;
}

/**
 * List tools through a real MCP client on a server built for the profile.
 * @param profile - The request profile
 * @returns The tools as they came off the wire
 */
async function mcpTools(profile: Profile): Promise<ListedTool[]> {
  const disabled = new Set(profile.disabledTools ?? []);
  const server = createMcpServer(vi.fn(), {
    notation: profile.notation,
    smallModelMode: profile.smallModelMode,
    liveApiEnabled: profile.liveApiEnabled,
    tools:
      disabled.size > 0
        ? ALL_TOOL_IDS.filter((name) => !disabled.has(name))
        : undefined,
  });
  const { client, clientTransport } = await connectClient(server);
  const received: unknown[] = [];
  const onmessage = clientTransport.onmessage;

  // Keep the raw message: the client's own parse reorders a schema's keys.
  clientTransport.onmessage = (message, extra) => {
    received.push(structuredClone(message));
    onmessage?.(message, extra);
  };

  await client.listTools();
  await client.close();

  return (received.at(-1) as { result: ListToolsResult }).result
    .tools as ListedTool[];
}

/**
 * @param tools - Listed tools
 * @returns The fields both listings carry, per tool
 */
function shared(tools: ListedTool[]): ListedTool[] {
  return tools.map(
    ({ name, title, description, annotations, inputSchema }) => ({
      name,
      title,
      description,
      annotations,
      inputSchema,
    }),
  );
}

describe("GET /api/tools", () => {
  it.each(PROFILES)(
    "lists every tool exactly as the device's tools/list does (%j)",
    async (profile) => {
      const rest = await restTools(profile);
      const mcp = await mcpTools(profile);

      expect(rest.length).toBeGreaterThan(0);
      expect(shared(rest)).toStrictEqual(shared(mcp));
      // Same key order too: a client may hash or diff the raw JSON.
      expect(JSON.stringify(rest.map((tool) => tool.inputSchema))).toBe(
        JSON.stringify(mcp.map((tool) => tool.inputSchema)),
      );
    },
  );
});
