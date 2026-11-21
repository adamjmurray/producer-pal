// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type RequestListener, type Server, createServer } from "node:http";

/**
 * A server whose listen fails with `code`, like a refused bind.
 *
 * @param code - The bind error code
 * @param handler - The request handler
 * @returns The server
 */
export function failingServer(code: string, handler: RequestListener): Server {
  const server = createServer(handler);

  server.listen = (() => {
    process.nextTick(() =>
      server.emit("error", Object.assign(new Error(code), { code })),
    );

    return server;
  }) as Server["listen"];

  return server;
}
