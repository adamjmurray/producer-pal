// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import Max from "max-api";
import { describe, expect, it, vi } from "vitest";
import { SMALL_MODEL_MODE_HEADER } from "#src/shared/config.ts";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.ts";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

type MockMax = typeof Max & {
  defaultMcpResponseHandler:
    ((requestId: string, ...chunks: string[]) => void) | null;
};
const mockMax = Max as MockMax;

/**
 * Connect an MCP client to the server with (or without) the small-model-mode
 * header. The transport carries the header on every request the client makes.
 *
 * @param serverUrl - The running server's /mcp URL
 * @param header - Value for the small-model-mode header, or undefined to omit it
 * @returns A connected client and its transport (close the transport when done)
 */
async function connectWithHeader(
  serverUrl: string,
  header: string | undefined,
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit:
      header == null
        ? undefined
        : { headers: { [SMALL_MODEL_MODE_HEADER]: header } },
  });

  await client.connect(transport);

  return { client, transport };
}

/**
 * Whether ppal-create-track's schema still exposes the `count` param — present
 * in full mode, dropped under small-model mode. A clean, stable discriminator
 * for the per-request schema shrink (the first of the two consumers the header
 * drives).
 *
 * @param serverUrl - The running server's /mcp URL
 * @param header - Value for the small-model-mode header, or undefined to omit it
 * @returns True when `count` is present in ppal-create-track's input schema
 */
async function createTrackHasCount(
  serverUrl: string,
  header: string | undefined,
): Promise<boolean> {
  const { client, transport } = await connectWithHeader(serverUrl, header);

  try {
    const { tools } = await client.listTools();
    const createTrack = tools.find((t) => t.name === "ppal-create-track");

    return createTrack?.inputSchema.properties?.count != null;
  } finally {
    await transport.close();
  }
}

/**
 * Call ppal-connect with a header and return the injected skills block — the
 * text block starting with the skills heading, which enrich-connect appends
 * Node-side and which varies (basic vs standard) by small-model mode. This is
 * the second consumer the header drives. Max is mocked to return a bare success
 * so the connect handler resolves and enrichment runs.
 *
 * @param serverUrl - The running server's /mcp URL
 * @param header - Value for the small-model-mode header, or undefined to omit it
 * @returns The injected skills block text, or "" when none was found
 */
async function connectSkillsBlock(
  serverUrl: string,
  header: string | undefined,
): Promise<string> {
  Max.outlet = vi.fn((message: string, requestId: string) => {
    if (message === "mcp_request") {
      setTimeout(() => {
        mockMax.defaultMcpResponseHandler!(
          requestId,
          JSON.stringify({ content: [{ type: "text", text: "{}" }] }),
          MAX_ERROR_DELIMITER,
        );
      }, 1);
    }

    return Promise.resolve();
  }) as typeof Max.outlet;

  const { client, transport } = await connectWithHeader(serverUrl, header);

  try {
    const result = await client.callTool({
      name: "ppal-connect",
      arguments: {},
    });
    const content = result.content as Array<{ type: string; text?: string }>;

    return (
      content.find((c) => c.text?.startsWith("# Producer Pal Skills"))?.text ??
      ""
    );
  } finally {
    await transport.close();
  }
}

// The harness leaves the global config.smallModelMode at its default (false).
describe("POST /mcp per-request small-model-mode header", () => {
  const appState = setupExpressAppServer();

  describe("tool-schema shrink", () => {
    it("shrinks tool schemas for this request when the header is true", async () => {
      expect(await createTrackHasCount(appState.serverUrl, "true")).toBe(false);
    });

    it("keeps full schemas when the header is explicitly false", async () => {
      expect(await createTrackHasCount(appState.serverUrl, "false")).toBe(true);
    });

    it("falls back to the global default (full schemas) when absent", async () => {
      // Proves an external MCP client that sends no header is unaffected.
      expect(await createTrackHasCount(appState.serverUrl, undefined)).toBe(
        true,
      );
    });

    it("does not leak one request's mode onto the next", async () => {
      // A shrunk request must not mutate the global for a later headerless one.
      await createTrackHasCount(appState.serverUrl, "true");

      expect(await createTrackHasCount(appState.serverUrl, undefined)).toBe(
        true,
      );
    });
  });

  describe("skills variant", () => {
    it("serves a different skills variant per-request driven by the header", async () => {
      const basic = await connectSkillsBlock(appState.serverUrl, "true");
      const standard = await connectSkillsBlock(appState.serverUrl, "false");

      // Both connect requests inject a skills block...
      expect(basic.startsWith("# Producer Pal Skills")).toBe(true);
      expect(standard.startsWith("# Producer Pal Skills")).toBe(true);
      // ...but the small-model (basic) variant differs from the standard one,
      // proving the per-request header — not just the global — selects it.
      expect(basic).not.toBe(standard);
    });
  });
});
