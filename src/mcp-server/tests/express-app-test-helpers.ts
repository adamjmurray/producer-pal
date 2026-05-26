// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import express from "express";
import Max from "max-api";
import { afterAll, beforeAll, type Mock, vi } from "vitest";
import { type CallLiveApiFunction } from "../create-mcp-server.ts";
import { registerRestApiRoutes } from "../routes/rest-api-routes.ts";

export type MockMax = typeof Max & {
  handlers: Map<string, (input: unknown) => void>;
};

export const mockMax = Max as MockMax;

/**
 * Build a helper that POSTs JSON to a config URL.
 *
 * @param configUrl - The fully-qualified /config endpoint
 * @returns Fetch helper that posts a JSON body
 */
export function makePostConfig(
  configUrl: string,
): (body: object) => Promise<Response> {
  return (body: object) =>
    fetch(configUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
}

interface ExpressAppTestState {
  server: Server | undefined;
  baseUrl: string;
  serverUrl: string;
  configUrl: string;
  postConfig: (body: object) => Promise<Response>;
}

/**
 * Set up an Express app server for testing.
 * Registers beforeAll/afterAll hooks to start and stop the server.
 *
 * @param options - Setup options
 * @param options.beforeStart - Optional callback to run before starting the server
 * @param options.enableDevFeatures - Set ENABLE_CODE_EXEC and ENABLE_DEV_CORS env vars before server start
 * @param options.enableLiveApi - POST /config { liveApiEnabled: true } after server start
 * @returns Test state with server and URL references
 */
export function setupExpressAppServer(
  options: {
    beforeStart?: () => void;
    enableDevFeatures?: boolean;
    enableLiveApi?: boolean;
  } = {},
): ExpressAppTestState {
  const state: ExpressAppTestState = {
    server: undefined,
    baseUrl: "",
    serverUrl: "",
    configUrl: "",
    postConfig: () => {
      throw new Error("postConfig used before server started");
    },
  };

  beforeAll(async () => {
    if (options.enableDevFeatures) {
      process.env.ENABLE_CODE_EXEC = "true";
      process.env.ENABLE_DEV_CORS = "true";
    }

    options.beforeStart?.();

    const { createExpressApp } = await import("../create-express-app.ts");
    const app = createExpressApp();
    const port = await new Promise<number>((resolve) => {
      state.server = app.listen(0, () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- server is assigned on the line above
        resolve((state.server!.address() as AddressInfo).port);
      });
    });

    state.baseUrl = `http://localhost:${port}`;
    state.serverUrl = `${state.baseUrl}/mcp`;
    state.configUrl = `${state.baseUrl}/config`;
    state.postConfig = makePostConfig(state.configUrl);

    if (options.enableLiveApi) {
      await state.postConfig({ liveApiEnabled: true });
    }
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

interface RestRoutesTestState {
  baseUrl: string;
  callLiveApi: Mock<CallLiveApiFunction>;
}

/**
 * Set up an Express server that only registers the REST API routes.
 * Registers beforeAll/afterAll hooks to start and stop the server.
 *
 * @param options - Setup options
 * @param options.getConfig - Function returning the runtime config (tools + liveApiEnabled)
 * @returns Test state with base URL and the shared callLiveApi mock
 */
export function setupRestRoutesServer(options: {
  getConfig: () => { tools: string[]; liveApiEnabled: boolean };
}): RestRoutesTestState {
  const callLiveApi = vi.fn<CallLiveApiFunction>();
  const state: RestRoutesTestState = {
    baseUrl: "",
    callLiveApi,
  };
  let server: Server | undefined;

  beforeAll(async () => {
    const app = express();

    app.use(express.json());
    registerRestApiRoutes(app, options.getConfig, callLiveApi);

    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;

    state.baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
  });

  return state;
}
