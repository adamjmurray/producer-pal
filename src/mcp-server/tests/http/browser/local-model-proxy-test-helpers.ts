// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { createServer, type Server, type ServerResponse } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach } from "vitest";
import { createExpressApp } from "../../../create-express-app.ts";
import {
  type HttpListeners,
  startHttpListeners,
} from "../../../helpers/http/http-listeners.ts";

/** The proxy running in the whole app, in front of a fake model server. */
export interface ProxyFixture {
  /** The fake model server. */
  upstream: () => Server;
  /** How the fake model server answers the next request. */
  answerWith: (handler: (res: ServerResponse) => void) => void;
  /** The fake model server's port. */
  modelPort: () => number;
  /**
   * @param modelUrl - The model URL to ask the proxy for
   * @returns The proxy's answer
   */
  proxy: (modelUrl: string) => Promise<Response>;
}

/**
 * Start the app and a fake model server before each test, and stop them after.
 *
 * @returns The running pair
 */
export function useProxyFixture(): ProxyFixture {
  let listeners: HttpListeners;
  let upstream: Server;
  let handler: (res: ServerResponse) => void = (res) => res.end();

  beforeEach(async () => {
    upstream = createServer((_req, res) => handler(res));
    await new Promise<void>((resolve) =>
      upstream.listen(0, "127.0.0.1", resolve),
    );
    listeners = await startHttpListeners(createExpressApp(), { port: 0 });
  });

  afterEach(async () => {
    await listeners.close();
    upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    handler = (res) => res.end();
  });

  return {
    upstream: () => upstream,
    answerWith: (next) => {
      handler = next;
    },
    modelPort: () => (upstream.address() as AddressInfo).port,
    proxy: (modelUrl) =>
      fetch(
        `http://127.0.0.1:${listeners.addresses()[0]?.port}/local-model-proxy`,
        { headers: { "x-local-model-url": modelUrl } },
      ),
  };
}
