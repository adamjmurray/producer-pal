// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { outdatedReason } from "#src/tools/shared/remote-script/outdated-remote-script.ts";
import { clearNodeRoutes } from "../../node-request-protocol.ts";
import { MIN_REMOTE_SCRIPT_VERSION } from "../port/remote-script-version.ts";

/**
 * Make a throwaway directory to stand in for the User Library.
 * @param label - Names the directory, so a leaked one says which test left it
 * @returns The new directory's path
 */
export function makeScratchUserLibrary(label: string): string {
  return mkdtempSync(join(tmpdir(), `ppal-remote-script-${label}-`));
}

/**
 * What the remote script's bridge answers for a route it doesn't have: 404 with
 * the routes it does.
 * @param route - The route asked for
 * @returns The answer
 */
export function unknownRouteAnswer(route: string): FakeAnswer {
  return {
    status: 404,
    body: { error: `unknown route: ${route}`, routes: ["/ping"] },
  };
}

/** What a route answers when a script of unknown version lacks the route. */
export const OUTDATED_ANSWER = {
  available: false,
  outdated: outdatedReason(null, MIN_REMOTE_SCRIPT_VERSION),
};

/** One request the stand-in remote script received. */
export interface ReceivedRequest {
  method: string;
  route: string;
  query: Record<string, string>;
  body: unknown;
}

/**
 * A JSON answer with a status, raw text, text cut off mid-answer, a dropped
 * connection before any reply, or null to never answer.
 */
export type FakeAnswer =
  | { status?: number; body: unknown }
  | { raw: string }
  | { cut: string }
  | { drop: true }
  | null;

export interface FakeRemoteScript {
  /** The port it listens on. */
  port: number;
  requests: ReceivedRequest[];
  close: () => Promise<void>;
}

/**
 * What a stand-in was asked, without the expiry each request carries.
 * @param fake - The stand-in, if one was started
 * @returns Each request's query
 */
export function queriesAsked(
  fake: FakeRemoteScript | undefined,
): Array<Record<string, string>> {
  return (fake?.requests ?? []).map(({ query }) =>
    Object.fromEntries(
      Object.entries(query).filter(([key]) => key !== "expires_in_ms"),
    ),
  );
}

/**
 * Start a stand-in remote script on a free port, and point the client at it
 * until it closes.
 * @param answer - Answers each request
 * @returns What it received, and how to stop it
 */
export async function startFakeRemoteScript(
  answer: (request: ReceivedRequest) => FakeAnswer,
): Promise<FakeRemoteScript> {
  const requests: ReceivedRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const text = Buffer.concat(chunks).toString("utf8");
      const request: ReceivedRequest = {
        method: req.method ?? "",
        route: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: text === "" ? undefined : JSON.parse(text),
      };

      requests.push(request);
      respond(res, answer(request));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  process.env.PPAL_REMOTE_SCRIPT_PORT = String(port);

  return {
    port,
    requests,
    close: async () => {
      // Back to the port nothing answers on, as test-setup.ts leaves it.
      process.env.PPAL_REMOTE_SCRIPT_PORT = "0";
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}

/**
 * Run a call against a stand-in that never answers, and let its wait run out
 * only once the stand-in has the request. A wait timed on the real clock could
 * end before the socket connects, which the client counts as not sent.
 * @param remote - The stand-in, which must never answer
 * @param waitMs - The wait to let run out: the call's reply wait
 * @param call - Makes the call
 * @returns What the call came to
 */
export async function callUntilItTimesOut<T>(
  remote: FakeRemoteScript,
  waitMs: number,
  call: () => Promise<T>,
): Promise<T> {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

  try {
    const pending = call();

    // A stand-in with the request means the client had connected.
    while (remote.requests.length === 0) {
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
    }

    vi.advanceTimersByTime(waitMs);

    return await pending;
  } finally {
    vi.useRealTimers();
  }
}

/**
 * Register the routes under test before each test; after it, clear them and
 * close the stand-in remote script.
 * @param register - Registers the routes under test
 * @returns Starts a stand-in that gives every request the same answer
 */
export function useFakeRemoteScriptRoutes(
  register: () => void,
): (answer: FakeAnswer) => Promise<FakeRemoteScript> {
  let fake: FakeRemoteScript | undefined;

  beforeEach(register);
  afterEach(async () => {
    clearNodeRoutes();
    await fake?.close();
    fake = undefined;
  });

  return async (answer) => {
    fake = await startFakeRemoteScript(() => answer);

    return fake;
  };
}

/**
 * Send a stand-in answer.
 * @param res - The response
 * @param answer - What to send, or null to leave the request hanging
 */
function respond(res: http.ServerResponse, answer: FakeAnswer): void {
  if (answer == null) {
    return;
  }

  if ("raw" in answer) {
    res.end(answer.raw);

    return;
  }

  if ("drop" in answer) {
    res.destroy();

    return;
  }

  if ("cut" in answer) {
    res.writeHead(200, { "Content-Length": "1000" });
    res.write(answer.cut, () => res.destroy());

    return;
  }

  res.writeHead(answer.status ?? 200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(answer.body));
}

/** What a reader that takes only .py files should return for the tree below. */
export const PY_ONLY_SOURCE = {
  "__init__.py": "top",
  "nested/deep.py": "deep",
};

/**
 * Write a remote-script tree: two .py files among local junk a reader must skip.
 * @param dir - Existing directory to fill
 */
export function writeScriptTreeWithJunk(dir: string): void {
  mkdirSync(join(dir, "__pycache__"));
  mkdirSync(join(dir, "nested"));
  writeFileSync(join(dir, "__init__.py"), "top", "utf8");
  writeFileSync(join(dir, ".DS_Store"), "finder", "utf8");
  writeFileSync(join(dir, "nested/notes.txt"), "scratch", "utf8");
  writeFileSync(join(dir, "stale.pyc"), "bytecode", "utf8");
  writeFileSync(join(dir, "__pycache__/a.pyc"), "bytecode", "utf8");
  writeFileSync(join(dir, "nested/deep.py"), "deep", "utf8");
}
