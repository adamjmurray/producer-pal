// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { errorMessage } from "#src/shared/error-message.ts";
import { logger } from "../file-logger.ts";

/**
 * Keeps a replaced client open until the calls already on it finish. Closing
 * it sooner rejects those calls with "Connection closed", which the bridge
 * would read as the device being gone while the device still acts on them.
 */
export class InFlightClients {
  private busy = new Map<Client, number>();
  private retired = new Set<Client>();

  /**
   * Run a request on a client and count it as in flight meanwhile.
   * @param client - The client to use
   * @param request - What to ask it
   * @returns Whatever the request answers
   */
  async run<T>(client: Client, request: () => Promise<T>): Promise<T> {
    this.busy.set(client, (this.busy.get(client) ?? 0) + 1);

    try {
      return await request();
    } finally {
      const left = (this.busy.get(client) ?? 1) - 1;

      if (left > 0) {
        this.busy.set(client, left);
      } else {
        this.busy.delete(client);

        if (this.retired.has(client)) {
          await this.close(client);
        }
      }
    }
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
