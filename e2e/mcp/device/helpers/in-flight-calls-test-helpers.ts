// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { MCP_URL } from "#evals/shared/mcp-url.ts";

/** When one tool-call request left the client and when its answer was read. */
export interface ToolCallTiming {
  /** Date.now() as the request was handed to fetch */
  sentAt: number;
  /** Date.now() once the whole response was read; 0 until then */
  answeredAt: number;
}

/** A connected client that times each tool-call request. */
export interface TimingClient {
  client: Client;
  /** One entry per tool-call request, in the order they were sent */
  toolCalls: ToolCallTiming[];
}

/**
 * Connect an MCP client whose tool-call requests are timed at the HTTP level,
 * to prove two calls were in flight together rather than one after the other.
 * Close `client` when done.
 * @returns The client and its timings
 */
export async function connectTimingClient(): Promise<TimingClient> {
  const toolCalls: ToolCallTiming[] = [];

  const timedFetch: FetchLike = async (url, init) => {
    const isToolCall =
      init?.method === "POST" &&
      typeof init.body === "string" &&
      init.body.includes('"tools/call"');
    const timing: ToolCallTiming = { sentAt: Date.now(), answeredAt: 0 };

    if (isToolCall) {
      toolCalls.push(timing);
    }

    const response = await fetch(url, init);

    if (isToolCall) {
      // The headers can arrive long before the answer, so time the body.
      const stamp = (): void => {
        timing.answeredAt = Date.now();
      };

      void response.clone().text().then(stamp, stamp);
    }

    return response;
  };

  const client = new Client({
    name: "producer-pal-e2e-timing",
    version: "1.0.0",
  });

  await client.connect(
    new StreamableHTTPClientTransport(new URL(MCP_URL), { fetch: timedFetch }),
  );

  return { client, toolCalls };
}
