// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { errorMessage } from "#src/shared/error-message.ts";
import { logger } from "../../file-logger.ts";

// How the SDK words a response stream that broke off (Ableton quit, the device
// was removed). It says so only through onerror and leaves the call waiting for
// its timeout. e2e/portal/tests/portal-device-gone-mid-call.test.ts fails if
// the wording changes.
const STREAM_DROPPED_PREFIX = "SSE stream disconnected";

/**
 * Keeps a replaced client open until the calls already on it finish. Closing
 * it sooner rejects those calls with "Connection closed", which the bridge
 * would read as the device being gone while the device still acts on them.
 * Also fails the calls on a client whose connection dropped.
 */
export class InFlightClients {
  /** Each busy client's calls, by the controller that can fail each one. */
  private busy = new Map<Client, Set<AbortController>>();
  private retired = new Set<Client>();

  /**
   * Run a request on a client and count it as in flight meanwhile.
   * @param client - The client to use
   * @param request - What to ask it, given a signal that fails the request
   * @returns Whatever the request answers
   */
  async run<T>(
    client: Client,
    request: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const calls = this.busy.get(client) ?? new Set<AbortController>();
    const controller = new AbortController();

    calls.add(controller);
    this.busy.set(client, calls);

    try {
      return await request(controller.signal);
    } finally {
      calls.delete(controller);

      if (calls.size === 0) {
        this.busy.delete(client);

        if (this.retired.has(client)) {
          await this.close(client);
        }
      }
    }
  }

  /**
   * Fail the calls on a client when its response stream drops, as a closed
   * connection, so they're answered at once. A call that is only slow keeps
   * waiting.
   * @param client - A new client
   * @returns The same client
   */
  failOnDrop(client: Client): Client {
    client.onerror = (error) => {
      if (!error.message.startsWith(STREAM_DROPPED_PREFIX)) {
        return;
      }

      logger.error(`[Bridge] Device connection dropped: ${error.message}`);

      const reason = new McpError(
        ErrorCode.ConnectionClosed,
        "The connection to Producer Pal dropped",
      );

      for (const controller of this.busy.get(client) ?? []) {
        controller.abort(reason);
      }
    };

    return client;
  }

  /**
   * Close a client that is no longer the current one, once its calls finish.
   * @param client - The client being replaced
   */
  async retire(client: Client): Promise<void> {
    if (this.busy.has(client)) {
      this.retired.add(client);

      return;
    }

    await this.close(client);
  }

  /** Close every client still waiting on calls, for shutdown. */
  async closeAll(): Promise<void> {
    await Promise.all([...this.retired].map((client) => this.close(client)));
  }

  private async close(client: Client): Promise<void> {
    this.retired.delete(client);

    try {
      await client.close();
    } catch (error) {
      logger.error(`Error closing old client: ${errorMessage(error)}`);
    }
  }
}
