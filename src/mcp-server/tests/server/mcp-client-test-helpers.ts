// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { vi } from "vitest";
import { createMcpServer } from "#src/mcp-server/create-mcp-server.ts";

type McpServerProfile = NonNullable<Parameters<typeof createMcpServer>[1]>;

/**
 * Connect a client to an in-memory server whose Live API call records its args.
 * @param profile - Server options
 * @returns The client, the recorded Live API calls, and every message the
 *   client received, as it came off the wire
 */
export async function connectMcpClient(
  profile: McpServerProfile = {},
): Promise<{
  client: Client;
  callLiveApi: ReturnType<typeof vi.fn>;
  received: unknown[];
}> {
  const callLiveApi = vi.fn(() =>
    Promise.resolve({ content: [{ type: "text", text: "ok" }] }),
  );
  const server = createMcpServer(callLiveApi, {
    ...profile,
    liveApiEnabled: true,
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  // Keep each message as it came off the wire: the client's own parse
  // reorders a schema's keys.
  const received: unknown[] = [];
  const onmessage = clientTransport.onmessage;

  clientTransport.onmessage = (message, extra) => {
    received.push(structuredClone(message));
    onmessage?.(message, extra);
  };

  return { client, callLiveApi, received };
}
