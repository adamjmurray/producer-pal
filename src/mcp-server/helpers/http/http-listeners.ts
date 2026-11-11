// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { createServer, type RequestListener, type Server } from "node:http";
import { type AddressInfo, type Socket, connect } from "node:net";
import Max from "max-api";
import { DEFAULT_MCP_PORT } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { nodeError, nodeLog, nodeWarn } from "../../node-for-max-logger.ts";
import {
  readAllowNetwork,
  writeAllowNetwork,
} from "../config-store/global-settings-store.ts";
import {
  type SwitchRequest,
  clearNetworkSwitcher,
  setNetworkAccessAllowed,
  setNetworkSwitcher,
} from "./network-access-state.ts";

const LOOPBACK_V4 = "127.0.0.1";
const LOOPBACK_V6 = "::1";
const PROBE_TIMEOUT_MS = 250;
const ANSWER_TIMEOUT_MS = 2000;
const CLOSE_TIMEOUT_MS = 1000;

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
  /**
   * Re-listen on the same port: all interfaces when true, this machine only
   * when false. A `request` that asked for it keeps its connection open until
   * its answer is sent, even if other switches are queued behind it.
   */
  setAllowNetwork: (
    allowNetwork: boolean,
    request?: SwitchRequest,
  ) => Promise<void>;
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
  /** Test seam: how long to wait for a switch's answer to be sent */
  answerTimeoutMs?: number;
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
  const answerTimeoutMs = options.answerTimeoutMs ?? ANSWER_TIMEOUT_MS;
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

  // Connections of requests waiting on a switch. A switch spares them all, not
  // only its own request's, so a queued one isn't cut before its turn.
  const held = new Set<Socket>();

  // Listen once more after dropping `held` if the port looks busy: a held
  // connection to a closing server may be what holds it. Listening while
  // connections are open is a platform detail we don't rely on.
  const listen = async (
    allowNetwork: boolean,
    closing: Closing,
  ): Promise<Server[]> => {
    try {
      return await listenAll(app, boundPort, allowNetwork, create);
    } catch (error) {
      if ((error as ServerError).code !== "EADDRINUSE" || held.size === 0) {
        throw error;
      }

      for (const socket of held) {
        socket.destroy();
      }

      held.clear();
      await settleWithin(closing.closed, CLOSE_TIMEOUT_MS);

      return await listenAll(app, boundPort, allowNetwork, create);
    }
  };

  // Never rejects: an unhandled rejection would kill the process. On failure,
  // fall back to this machine only, never to all interfaces.
  const relisten = async (next: boolean): Promise<void> => {
    const closing = closeAll(servers, held);

    await closing.ready;
    servers = [];
    current = false;
    setNetworkAccessAllowed(false);

    try {
      servers = await listen(next, closing);
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
      servers = await listen(false, closing);
      logNetworkAccess(false);
    } catch (error) {
      nodeError(errorMessage(error));
    }
  };

  const listeners: HttpListeners = {
    setAllowNetwork: (next, request) => {
      if (request != null) {
        hold(held, request.keep);
      }

      return enqueue(async () => {
        // Nothing listening (a failed switch): retry even an unchanged value.
        if (next !== current || servers.length === 0) {
          await relisten(next);
          saveSetting(current);
        }

        showState(current);

        if (request != null) {
          await deliver(request, current, servers.length > 0, answerTimeoutMs);
          held.delete(request.keep);
        }
      });
    },
    addresses: () => servers.map((server) => server.address() as AddressInfo),
    close: () =>
      enqueue(async () => {
        await closeAll(servers).closed;
        servers = [];
        setNetworkAccessAllowed(false);
        clearNetworkSwitcher(listeners.setAllowNetwork);
      }),
  };

  Max.addHandler("allowNetwork", (value: unknown) => {
    void listeners.setAllowNetwork(isOn(value));
  });

  setNetworkSwitcher(listeners.setAllowNetwork);

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
    throw portInUseError(port);
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
      await closeAll([v4]).closed;
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
  trackConnections(server);

  return new Promise((resolve, reject) => {
    const onError = (error: ServerError): void => {
      reject(
        error.code === "EADDRINUSE"
          ? portInUseError(port)
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

function portInUseError(port: number): Error {
  return Object.assign(new Error(portInUse(port)), { code: "EADDRINUSE" });
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

const openConnections = new WeakMap<Server, Set<Socket>>();

// Node keeps no list of a server's connections, and closing all but one needs it.
function trackConnections(server: Server): void {
  const sockets = new Set<Socket>();

  openConnections.set(server, sockets);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
}

interface Closing {
  /** Every server without a spared connection has closed. */
  ready: Promise<void>;
  /** Every server has closed, spared connections included. */
  closed: Promise<void>;
}

// Drops open connections too: turning network access off must cut off
// devices already connected, and the port must be free to listen again.
// `spare` connections (requests waiting for their answer) are left open. A
// server's close callback waits for its last connection, so servers holding
// one aren't waited for in `ready`.
function closeAll(
  servers: Server[],
  spare: ReadonlySet<Socket> = new Set(),
): Closing {
  const ready: Array<Promise<void>> = [];
  const closed: Array<Promise<void>> = [];

  for (const server of servers) {
    const done = new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    // Every server listenOn started is tracked.
    const sockets = openConnections.get(server) as Set<Socket>;
    let holdsSpare = false;

    for (const socket of sockets) {
      if (spare.has(socket)) {
        holdsSpare = true;
      } else {
        socket.destroy();
      }
    }

    server.closeIdleConnections();
    closed.push(done);
    ready.push(holdsSpare ? Promise.resolve() : done);
  }

  return {
    ready: Promise.all(ready).then(() => undefined),
    closed: Promise.all(closed).then(() => undefined),
  };
}

function hold(held: Set<Socket>, socket: Socket): void {
  held.add(socket);
  socket.once("close", () => held.delete(socket));
}

// Sends the answer and waits for it to be out, bounded so a stuck client can't
// jam the queue. Never rejects.
async function deliver(
  request: SwitchRequest,
  allowNetwork: boolean,
  listening: boolean,
  timeoutMs: number,
): Promise<void> {
  const sent = Promise.resolve()
    .then(() => request.answer({ allowNetwork, listening }))
    .catch((error: unknown) => nodeError(errorMessage(error)));

  await settleWithin(sent, timeoutMs);
}

async function settleWithin(
  promise: Promise<unknown>,
  ms: number,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  await Promise.race([
    promise,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms);
    }),
  ]);
  clearTimeout(timer);
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
