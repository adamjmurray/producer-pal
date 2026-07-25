// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Shared harness for the POST /mcp per-request header suites (small-model mode,
// disabled tools, notation). The headers ride the same transport and drive the
// same consumers — the registered tools/schemas a client lists, the skills block
// enrich-connect appends to ppal-connect, and (notation only) the context blob
// handed to V8 — so the plumbing lives here once.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Max from "max-api";
import { vi } from "vitest";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.ts";

type MockMax = typeof Max & {
  defaultMcpResponseHandler:
    ((requestId: string, ...chunks: string[]) => void) | null;
};

const mockMax = Max as MockMax;

/** Prefix identifying the skills block among a connect result's text blocks. */
export const SKILLS_HEADER = "# Producer Pal Skills";

/**
 * Connect an MCP client carrying the given headers. The transport applies them
 * to every request the client makes; pass `{}` to send none.
 *
 * @param serverUrl - The running server's /mcp URL
 * @param headers - Request headers to send, or `{}` for a bare client
 * @returns A connected client and its transport (close the transport when done)
 */
export async function connectWithHeaders(
  serverUrl: string,
  headers: Record<string, string>,
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit:
      Object.keys(headers).length === 0
        ? undefined
        : { headers: { ...headers } },
  });

  await client.connect(transport);

  return { client, transport };
}

/**
 * The tool names a client sees with the given headers.
 *
 * @param serverUrl - The running server's /mcp URL
 * @param headers - Request headers to send
 * @returns The listed tool names
 */
export async function listToolNames(
  serverUrl: string,
  headers: Record<string, string>,
): Promise<string[]> {
  const { client, transport } = await connectWithHeaders(serverUrl, headers);

  try {
    const { tools } = await client.listTools();

    return tools.map((tool) => tool.name);
  } finally {
    await transport.close();
  }
}

/**
 * Mock Max so every tool call resolves with a bare success, and record the
 * contextJSON blob each one carried to V8 (where the per-request overrides —
 * timeoutMs, compactOutput, notation — arrive).
 *
 * @returns The array the mock appends each call's contextJSON to, in order
 */
export function mockMaxSuccess(): string[] {
  const contextBlobs: string[] = [];

  Max.outlet = vi.fn(
    (
      message: string,
      requestId: string,
      _tool?: string,
      _argsJSON?: string,
      contextJSON?: string,
    ) => {
      if (message === "mcp_request") {
        contextBlobs.push(contextJSON ?? "");
        setTimeout(() => {
          mockMax.defaultMcpResponseHandler?.(
            requestId,
            JSON.stringify({ content: [{ type: "text", text: "{}" }] }),
            MAX_ERROR_DELIMITER,
          );
        }, 1);
      }

      return Promise.resolve();
    },
  ) as typeof Max.outlet;

  return contextBlobs;
}

/**
 * Call a tool with the given headers and return the per-request context V8
 * received for it — the seam a notation override has to travel through to reach
 * note parsing/formatting.
 *
 * @param serverUrl - The running server's /mcp URL
 * @param headers - Request headers to send
 * @param toolName - Tool to call (any tool; the Max response is stubbed)
 * @returns The parsed contextJSON blob for that call
 */
export async function callToolRequestContext(
  serverUrl: string,
  headers: Record<string, string>,
  toolName: string,
): Promise<Record<string, unknown>> {
  const contextBlobs = mockMaxSuccess();
  const { client, transport } = await connectWithHeaders(serverUrl, headers);

  try {
    await client.callTool({ name: toolName, arguments: {} });

    return JSON.parse(contextBlobs[0] ?? "{}") as Record<string, unknown>;
  } finally {
    await transport.close();
  }
}

/**
 * Call ppal-connect with the given headers and return the injected skills block
 * — the text block starting with the skills heading, which enrich-connect
 * appends Node-side. Max is mocked to return a bare success so the connect
 * handler resolves and enrichment runs.
 *
 * @param serverUrl - The running server's /mcp URL
 * @param headers - Request headers to send
 * @returns The injected skills block text, or "" when none was found
 */
export async function connectSkillsBlock(
  serverUrl: string,
  headers: Record<string, string>,
): Promise<string> {
  mockMaxSuccess();

  const { client, transport } = await connectWithHeaders(serverUrl, headers);

  try {
    const result = await client.callTool({
      name: "ppal-connect",
      arguments: {},
    });
    const content = result.content as Array<{ type: string; text?: string }>;

    return content.find((c) => c.text?.startsWith(SKILLS_HEADER))?.text ?? "";
  } finally {
    await transport.close();
  }
}
