// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type ClientRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";
import { type AddressInfo } from "node:net";
import { type Express } from "express";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type HttpListeners,
  startHttpListeners,
} from "../../../helpers/http/http-listeners.ts";

export type FakeHandler = (req: IncomingMessage, res: ServerResponse) => void;

/** A request the fake model server received. */
export interface FakeHit {
  method?: string;
  url?: string;
  headers: IncomingMessage["headers"];
  /** Filled in as the body arrives. */
  body: string;
}

/** A fake model server on loopback, fresh for each test. */
export interface FakeModelServer {
  /** Its port. */
  port: () => number;
  /** The requests it received, oldest first. */
  hits: () => FakeHit[];
  /** Answer the next requests with this handler (default: an empty model list). */
  answerWith: (handler: FakeHandler) => void;
  /** Stop listening, so the port has nothing behind it. */
  stop: () => Promise<void>;
}

/**
 * Start a fake model server before each test and stop it after. Call it before
 * any `beforeEach` that needs its port.
 *
 * @returns The running server
 */
export function useFakeModelServer(): FakeModelServer {
  let server: Server;
  let port = 0;
  let hits: FakeHit[] = [];
  let handler: FakeHandler;

  const stop = async (): Promise<void> => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };

  beforeEach(async () => {
    hits = [];

    handler = (_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end('{"data":[]}');
    };

    server = createServer((req, res) => {
      const hit: FakeHit = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: "",
      };

      hits.push(hit);
      req.on("data", (chunk: Buffer) => (hit.body += chunk.toString()));
      handler(req, res);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    if (server.listening) {
      await stop();
    }
  });

  return {
    port: () => port,
    hits: () => hits,
    answerWith: (next) => {
      handler = next;
    },
    stop,
  };
}

/**
 * Register the streaming cases every forwarding route must pass: chunks cross
 * as they arrive, and a browser that disconnects stops the upstream request.
 *
 * @param fake - The fake model server behind the route
 * @param stream - Opens a streamed request through the route and passes its
 *   live response to `onResponse`
 */
export function itStreamsUnbuffered(
  fake: FakeModelServer,
  stream: (
    onResponse: (res: IncomingMessage, req: ClientRequest) => void,
  ) => void,
): void {
  it("streams chunks as they arrive, before the upstream ends", async () => {
    let finish = (): void => undefined;

    fake.answerWith((_req, res) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.write("data: one\n\n");
      finish = () => res.end("data: two\n\n");
    });

    const first = await new Promise<string>((resolve) => {
      stream((res) => {
        res.once("data", (chunk: Buffer) => resolve(chunk.toString()));
      });
    });

    // The upstream hasn't ended: only the first chunk has crossed.
    expect(first).toBe("data: one\n\n");
    finish();
  });

  it("stops the upstream request when the browser disconnects", async () => {
    const closed = new Promise<void>((resolve) => {
      fake.answerWith((_req, res) => {
        res.write("data: one\n\n");
        res.on("close", resolve);
      });
    });

    stream((res, req) => {
      res.once("data", () => req.destroy());
    });

    await expect(closed).resolves.toBeUndefined();
  });
}

/**
 * Serve an app on a free loopback port for each test.
 *
 * @param build - Builds the app, once per test (after earlier `beforeEach`es)
 * @returns The port it listens on
 */
export function useListeningApp(build: () => Express): () => number {
  let listeners: HttpListeners;
  let port = 0;

  beforeEach(async () => {
    listeners = await startHttpListeners(build(), { port: 0 });
    port = listeners.addresses()[0]?.port ?? 0;
  });

  afterEach(async () => {
    await listeners.close();
  });

  return () => port;
}

/**
 * The message of an OpenAI-style error body.
 *
 * @param text - The response body
 * @returns `error.message`
 */
export function errorBodyMessage(text: string): string {
  return (JSON.parse(text) as { error: { message: string } }).error.message;
}
