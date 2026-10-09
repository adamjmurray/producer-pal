// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A stand-in for the Producer Pal remote script inside Live, so a test can say
// whether it is running and how it answers a /load. It speaks the same HTTP the
// real one does: JSON in, JSON out, /ping to say it's there. The portal finds
// it through PPAL_REMOTE_SCRIPT_PORT.

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { closeServer, reservePort } from "./local-server";

/** What a route answers. */
export interface StubReply {
  status: number;
  body: Record<string, unknown>;
}

/** One request the remote script received. */
export interface ScriptRequest {
  method: string;
  route: string;
  body: Record<string, unknown> | null;
}

/** Answers a request; `n` counts the requests this route has had, from 1. */
export type RouteHandler = (
  request: ScriptRequest,
  n: number,
) => StubReply | Promise<StubReply>;

export interface StubRemoteScriptOptions {
  /** False to reserve the port but not answer, like a Live with no script */
  online?: boolean;
  /** What /ping reports as the User Library; absent leaves the field out */
  userLibrary?: string | null;
  /** Routes beyond /ping, keyed "POST /load" */
  routes?: Record<string, RouteHandler>;
}

/** The fake remote script under a test's control. */
export interface StubRemoteScript {
  port: number;
  /** The env var that points a portal at it */
  env: Record<string, string>;
  /** Every request received, in order. */
  requests: ScriptRequest[];
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/**
 * Create a stub remote script on a free port.
 * @param options - Whether it answers, and what it reports
 * @returns The remote script
 */
export async function createStubRemoteScript(
  options: StubRemoteScriptOptions = {},
): Promise<StubRemoteScript> {
  const port = await reservePort();
  const requests: ScriptRequest[] = [];
  const counts = new Map<string, number>();
  const server = createServer((req, res) => {
    void answer(req, res, { options, port, requests, counts });
  });
  const script: StubRemoteScript = {
    port,
    env: { PPAL_REMOTE_SCRIPT_PORT: String(port) },
    requests,
    start: () =>
      new Promise((resolve) => {
        server.listen(port, "127.0.0.1", () => resolve());
      }),
    stop: () => closeServer(server),
  };

  if (options.online !== false) await script.start();

  return script;
}

// --- Helpers below main exports ---

interface Context {
  options: StubRemoteScriptOptions;
  port: number;
  requests: ScriptRequest[];
  counts: Map<string, number>;
}

/**
 * Answer one request.
 * @param req - The incoming request
 * @param res - The response to write
 * @param context - The script's options and recorders
 */
async function answer(
  req: IncomingMessage,
  res: ServerResponse,
  { options, port, requests, counts }: Context,
): Promise<void> {
  const route = (req.url ?? "").split("?")[0] ?? "";
  const request: ScriptRequest = {
    method: req.method ?? "GET",
    route,
    body: await readBody(req),
  };
  const key = `${request.method} ${route}`;
  const n = (counts.get(key) ?? 0) + 1;

  counts.set(key, n);
  requests.push(request);

  const reply = await replyTo(key, request, n, { options, port });

  res.writeHead(reply.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(reply.body));
}

/**
 * @param key - "METHOD /route"
 * @param request - The request
 * @param n - How many requests this route has had
 * @param context - The script's options and port
 * @param context.options - The script's options
 * @param context.port - The port it answers on
 * @returns What to send back
 */
async function replyTo(
  key: string,
  request: ScriptRequest,
  n: number,
  { options, port }: Pick<Context, "options" | "port">,
): Promise<StubReply> {
  if (key === "GET /ping") {
    return {
      status: 200,
      body: {
        ok: true,
        live_version: "12.4.0",
        script_version: "2.5.0",
        port,
        ...(options.userLibrary === undefined
          ? {}
          : { user_library: options.userLibrary }),
      },
    };
  }

  const handler = Object.entries(options.routes ?? {}).find(
    ([route]) => route === key,
  )?.[1];

  // The real script's answer to a route it doesn't have lists the ones it does.
  return handler == null
    ? {
        status: 404,
        body: { error: `unknown route: ${request.route}`, routes: ["/ping"] },
      }
    : await handler(request, n);
}

/**
 * @param req - The incoming request
 * @returns The JSON body, or null when there isn't one
 */
async function readBody(
  req: IncomingMessage,
): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) chunks.push(chunk as Buffer);

  const text = Buffer.concat(chunks).toString();

  return text === "" ? null : (JSON.parse(text) as Record<string, unknown>);
}
