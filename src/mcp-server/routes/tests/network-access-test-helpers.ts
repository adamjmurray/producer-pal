// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import {
  type Agent,
  type RequestListener,
  type Server,
  createServer,
  request,
} from "node:http";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import express from "express";
import Max from "max-api";
import { afterEach, beforeEach, vi } from "vitest";
import {
  type HttpListeners,
  startHttpListeners,
} from "../../helpers/http/http-listeners.ts";
import { failingServer } from "../../tests/http/listen-failure-test-helpers.ts";
import { registerNetworkAccessRoutes } from "../config/network-access-route.ts";

export interface Sent {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: { allowNetwork?: boolean; error?: string; message?: string };
}

export interface SendOptions {
  method?: string;
  path?: string;
  /** Where to connect; defaults to 127.0.0.1. */
  connectTo?: string;
  /** The raw request body; defaults to the JSON of `{ allowNetwork: true }`. */
  body?: string;
  headers?: Record<string, string>;
  agent?: Agent;
  /** Leave the Host header out. */
  noHost?: boolean;
}

/** This computer's own network address, which looks like another computer. */
export const LAN_ADDRESS = Object.values(networkInterfaces())
  .flatMap((addrs) => addrs ?? [])
  .find((addr) => addr.family === "IPv4" && !addr.internal)?.address;

export const HAS_IPV6_LOOPBACK = Object.values(networkInterfaces()).some(
  (addrs) => addrs?.some((addr) => addr.address === "::1"),
);

/**
 * Send a request with exact headers (fetch won't let a test choose `Host` or
 * `Origin`).
 *
 * @param port - The server's port
 * @param options - Method, target address, body and headers
 * @returns The status, headers and parsed JSON body ({} when not JSON)
 */
export function send(port: number, options: SendOptions = {}): Promise<Sent> {
  const { method = "PUT", connectTo = "127.0.0.1", agent } = options;
  const payload = options.body ?? JSON.stringify({ allowNetwork: true });
  const hasBody = method === "PUT" || method === "POST";

  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: connectTo,
        port,
        path: options.path ?? "/network-access",
        method,
        agent: agent ?? false,
        setHost: options.noHost !== true,
        headers: hasBody
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
              ...options.headers,
            }
          : options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: parseBody(Buffer.concat(chunks).toString()),
          }),
        );
      },
    );

    req.on("error", reject);
    req.end(hasBody ? payload : undefined);
  });
}

// An empty or plain-text body (a preflight's) reads as {}.
function parseBody(text: string): Sent["body"] {
  try {
    return JSON.parse(text) as Sent["body"];
  } catch {
    return {};
  }
}

/** A server factory whose next servers can be made to fail to listen. */
export interface ListenFailures {
  create: (handler: RequestListener) => Server;
  /** Fail the next `count` servers created (default: all from now on). */
  failNext: (code: string, count?: number) => void;
  /** Stop failing. */
  reset: () => void;
}

/**
 * A server factory for `startHttpListeners` that can fail servers like a
 * refused bind.
 *
 * @returns The factory and its switches
 */
export function listenFailures(): ListenFailures {
  let remaining = 0;
  let code = "EACCES";

  return {
    create: (handler) => {
      if (remaining > 0) {
        remaining--;

        return failingServer(code, handler);
      }

      return createServer(handler);
    },
    failNext: (failCode, count = Infinity) => {
      code = failCode;
      remaining = count;
    },
    reset: () => {
      remaining = 0;
    },
  };
}

/**
 * The state the device toggle was last told.
 *
 * @returns 1, 0, or undefined when nothing was shown
 */
export function shownOnDevice(): unknown {
  return vi
    .mocked(Max.outlet)
    .mock.calls.findLast(
      (c) => c[0] === "config" && c[1] === "allowNetwork",
    )?.[2];
}

/**
 * The saved settings file.
 *
 * @param dir - The config dir
 * @returns The parsed settings (throws if there is no file)
 */
export function savedSettings(dir: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(dir, "settings.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

/** A running server with just the /network-access route, and how to reach it. */
export interface RouteServer {
  failures: ListenFailures;
  listeners: () => HttpListeners;
  port: () => number;
  /** PUT `{ allowNetwork }` with a loopback Host, plus any overrides. */
  put: (allowNetwork: boolean, options?: SendOptions) => Promise<Sent>;
  /** How many PUTs have reached the server. */
  arrived: () => number;
}

/**
 * Start a server with only the /network-access route before each test, on real
 * listeners at port 0, and close it after. Use with `useTempConfigDir`.
 *
 * @returns Handles to the running server
 */
export function useRouteServer(): RouteServer {
  const failures = listenFailures();
  let listeners: HttpListeners;
  let port = 0;
  let arrived = 0;

  beforeEach(async () => {
    vi.clearAllMocks();
    failures.reset();
    arrived = 0;

    const app = express();

    app.use((req, _res, next) => {
      arrived += req.method === "PUT" ? 1 : 0;
      next();
    });
    app.use(express.json());
    registerNetworkAccessRoutes(app);
    listeners = await startHttpListeners(app, {
      port: 0,
      create: failures.create,
    });
    port = listeners.addresses()[0]?.port ?? 0;
  });

  afterEach(async () => {
    await listeners.close();
  });

  return {
    failures,
    listeners: () => listeners,
    port: () => port,
    arrived: () => arrived,
    put: (allowNetwork, options = {}) =>
      send(port, {
        body: JSON.stringify({ allowNetwork }),
        ...options,
        headers: { host: `localhost:${port}`, ...options.headers },
      }),
  };
}
