// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterAll, beforeAll } from "vitest";

interface ExpressAppTestState {
  server: Server | undefined;
  serverUrl: string;
}

/**
 * Set up an Express app server for testing.
 * Registers beforeAll/afterAll hooks to start and stop the server.
 *
 * @param options - Setup options
 * @param options.beforeStart - Optional callback to run before starting the server
 * @returns Test state with server and URL references
 */
export function setupExpressAppServer(
  options: { beforeStart?: () => void } = {},
): ExpressAppTestState {
  const state: ExpressAppTestState = { server: undefined, serverUrl: "" };

  beforeAll(async () => {
    options.beforeStart?.();

    const { createExpressApp } = await import("../create-express-app.ts");
    const app = createExpressApp();
    const port = await new Promise<number>((resolve) => {
      state.server = app.listen(0, () => {
        const addr = state.server?.address() as AddressInfo | undefined;

        resolve(addr?.port ?? 0);
      });
    });

    state.serverUrl = `http://localhost:${port}/mcp`;
  });

  afterAll(async () => {
    if (state.server) {
      await new Promise<void>((resolve) =>
        state.server?.close(() => resolve()),
      );
    }
  });

  return state;
}
