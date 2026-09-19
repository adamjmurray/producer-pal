// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { mkdtempSync } from "node:fs";
import http from "node:http";
import { type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Make a throwaway directory to stand in for the User Library.
 * @param label - Names the directory, so a leaked one says which test left it
 * @returns The new directory's path
 */
export function makeScratchUserLibrary(label: string): string {
  return mkdtempSync(join(tmpdir(), `ppal-remote-script-${label}-`));
}

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
  requests: ReceivedRequest[];
  close: () => Promise<void>;
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
  process.env.PPAL_REMOTE_SCRIPT_PORT = String(
    (server.address() as AddressInfo).port,
  );

  return {
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
