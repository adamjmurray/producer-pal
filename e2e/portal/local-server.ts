// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Server } from "node:http";
import { createServer } from "node:net";

/**
 * Find a free port and release it, so the device can claim it later — the only
 * way to point a portal at a device that isn't listening yet.
 * @returns The port number
 */
export function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();

    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();

      if (address == null || typeof address === "string") {
        reject(new Error("Could not reserve a port for the stub device"));

        return;
      }

      probe.close(() => resolve(address.port));
    });
  });
}

/**
 * Stop listening, dropping live connections.
 * @param server - The HTTP server
 */
export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();

      return;
    }

    // The portal's HTTP client keeps its socket alive, which would hold close()
    // open until that socket times out.
    server.closeAllConnections();
    server.close(() => resolve());
  });
}
