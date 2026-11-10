// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { createServer, type RequestListener, type Server } from "node:http";
import { type AddressInfo, connect } from "node:net";
import Max from "max-api";
import { DEFAULT_MCP_PORT } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { nodeError, nodeLog, nodeWarn } from "../../node-for-max-logger.ts";
import {
  readAllowNetwork,
  writeAllowNetwork,
} from "../config-store/global-settings-store.ts";
import { setNetworkAccessAllowed } from "./network-access-state.ts";

const LOOPBACK_V4 = "127.0.0.1";
const LOOPBACK_V6 = "::1";
const PROBE_TIMEOUT_MS = 250;

// Errors binding ::1 that mean IPv6 is turned off on this machine.
const IPV6_UNAVAILABLE_CODES = new Set([
  "EADDRNOTAVAIL",
  "EAFNOSUPPORT",
  "EINVAL",
]);

interface ServerError extends Error {
  code?: string;
}

export interface HttpListeners {
  /** Re-listen on the same port: all interfaces when true, this machine only when false */
  setAllowNetwork: (allowNetwork: boolean) => Promise<void>;
  /** The addresses currently listened on */
  addresses: () => AddressInfo[];
  close: () => Promise<void>;
}

export interface HttpListenOptions {
  port: number;
  /** Called once listening, like `server.listen(port, callback)` */
  onListening?: () => void;
  /** Test seam for the server factory */
  create?: (app: RequestListener) => Server;
}

/**
 * Serve the app on this machine only (127.0.0.1 and ::1), or on all interfaces
 * when "Allow other devices to connect" is on. The setting is saved per
 * computer in ~/.producer-pal/settings.json, never in the Live Set or a start
 * argument, so opening someone else's Set or a crash restart can't open the
 * network. The device's `allowNetwork 0|1` message changes it; Node sends the
 * actual state back to the toggle on start and after each change.
 *
 * @param app - The request handler (the Express app)
 * @param options - Port, listening callback, server factory
 * @returns Control over the listening servers
 */
export async function startHttpListeners(
  app: RequestListener,
  options: HttpListenOptions,
): Promise<HttpListeners> {
  const { port, create = createServer } = options;
  let current = readAllowNetwork();
  let servers = await listenAll(app, port, current, create);

  setNetworkAccessAllowed(current);

  // Port 0 (tests) picks one; re-listen on the same one.
  const boundPort = (servers[0]?.address() as AddressInfo | null)?.port ?? port;
  let queue: Promise<void> = Promise.resolve();

  logNetworkAccess(current);
  showState(current);

  // Serialized so quick toggles can't overlap a close and a listen.
  const enqueue = (step: () => Promise<void>): Promise<void> => {
    queue = queue.then(step); // Steps never reject, so the chain can't jam.

    return queue;
  };

  // Never rejects: an unhandled rejection would kill the process. On failure,
  // fall back to this machine only, never to all interfaces.
  const relisten = async (next: boolean): Promise<void> => {
    await closeAll(servers);
    servers = [];
    current = false;
    setNetworkAccessAllowed(false);

    try {
      servers = await listenAll(app, boundPort, next, create);
      current = next;
      setNetworkAccessAllowed(next);
      logNetworkAccess(next);

      return;
    } catch (error) {
      nodeError(errorMessage(error));
    }

    if (!next) {
      return; // Nothing is listening; the next message retries.
    }

    try {
      servers = await listenAll(app, boundPort, false, create);
      logNetworkAccess(false);
    } catch (error) {
      nodeError(errorMessage(error));
    }
  };

  const listeners: HttpListeners = {
    setAllowNetwork: (next) =>
      enqueue(async () => {
        // Nothing listening (a failed switch): retry even an unchanged value.
        if (next !== current || servers.length === 0) {
          await relisten(next);
          saveSetting(current);
        }

        showState(current);
      }),
    addresses: () => servers.map((server) => server.address() as AddressInfo),
    close: () =>
      enqueue(async () => {
        await closeAll(servers);
        servers = [];
        setNetworkAccessAllowed(false);
      }),
  };

  Max.addHandler("allowNetwork", (value: unknown) => {
    void listeners.setAllowNetwork(isOn(value));
  });

  options.onListening?.();

  return listeners;
}

/**
 * Read the port from the node.script arguments (`port 3350`).
 *
 * @param argv - process.argv
 * @returns The port
 */
export function parseServerArgs(argv: string[]): { port: number } {
  let port = DEFAULT_MCP_PORT;

  for (const [index, arg] of argv.entries()) {
    if (arg === "port") {
      const value = argv[index + 1];

      if (value == null) {
        throw new Error("Missing port value");
      }

      port = Number.parseInt(value);

      if (Number.isNaN(port)) {
        throw new Error(`Invalid port: ${value}`);
      }
    }
  }

  return { port };
}

// Only an explicit 1 opens the network: a symbol "0" must not count as on.
function isOn(value: unknown): boolean {
  return value === 1 || value === "1";
}

async function listenAll(
  app: RequestListener,
  port: number,
  allowNetwork: boolean,
  create: (app: RequestListener) => Server,
): Promise<Server[]> {
  // SO_REUSEADDR lets a wildcard and a loopback socket share a port, so a bind
  // can succeed while another program still gets this machine's traffic.
  if (port !== 0 && (await loopbackAnswers(port))) {
    throw new Error(portInUse(port));
  }

  if (allowNetwork) {
    return [await listenOn(create(app), port)];
  }

  const v4 = await listenOn(create(app), port, LOOPBACK_V4);
  const v4Port = (v4.address() as AddressInfo).port;

  // Clients that resolve `localhost` to ::1 need this one.
  try {
    return [v4, await listenOn(create(app), v4Port, LOOPBACK_V6)];
  } catch (error) {
    const code = (error as ServerError).code;

    if (code == null || !IPV6_UNAVAILABLE_CODES.has(code)) {
      await closeAll([v4]);
      throw error;
    }

    nodeWarn(
      `Producer Pal: IPv6 is unavailable (${code}), listening on ${LOOPBACK_V4} only.`,
    );

    return [v4];
  }
}

function listenOn(
  server: Server,
  port: number,
  host?: string,
): Promise<Server> {
  return new Promise((resolve, reject) => {
    const onError = (error: ServerError): void => {
      reject(
        error.code === "EADDRINUSE"
          ? new Error(portInUse(port))
          : Object.assign(
              new Error(`Producer Pal failed to start: ${error.message}`),
              { code: error.code },
            ),
      );
    };

    server.once("error", onError);
    server.listen({ port, host }, () => {
      server.off("error", onError);
      resolve(server);
    });
  });
}

function portInUse(port: number): string {
  return `Producer Pal failed to start: Port ${port} is already in use.`;
}

async function loopbackAnswers(port: number): Promise<boolean> {
  const answers = await Promise.all(
    [LOOPBACK_V4, LOOPBACK_V6].map((host) => answersOn(host, port)),
  );

  return answers.includes(true);
}

// Refused, unreachable (no IPv6), or no answer in time: nothing is there.
function answersOn(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({
      host,
      port,
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });

    const done = (answered: boolean): void => {
      socket.destroy();
      resolve(answered);
    };

    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

// Saves what actually took effect, so a failed switch to all interfaces is
// saved as off.
function saveSetting(allowNetwork: boolean): void {
  try {
    writeAllowNetwork(allowNetwork);
  } catch (error) {
    nodeError(
      `Producer Pal: couldn't save the network setting: ${errorMessage(error)}`,
    );
  }
}

function showState(allowNetwork: boolean): void {
  void Max.outlet("config", "allowNetwork", allowNetwork ? 1 : 0);
}

// Drops open connections too: turning network access off must cut off
// devices already connected, and the port must be free to listen again.
async function closeAll(servers: Server[]): Promise<void> {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
}

function logNetworkAccess(allowNetwork: boolean): void {
  if (allowNetwork) {
    nodeWarn(
      "Producer Pal: other devices can connect. Anyone on your network can " +
        "control Live, and there's no password. Only use a network you trust.",
    );
  } else {
    nodeLog("Producer Pal: only this computer can connect.");
  }
}
