// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// One HTTP exchange with the remote script. node:http with no keep-alive
// agent: Node's default fetch dispatcher can stall a request by ~500ms.

import http from "node:http";
import {
  RemoteScriptConnectionLost,
  RemoteScriptTimeout,
} from "../remote-script-errors.ts";

const HOST = "127.0.0.1";

/** A remote script that hasn't taken the connection by now isn't running. */
const CONNECT_TIMEOUT_MS = 1000;

/** What came back: a JSON object, or nothing of ours. */
export type WireReply =
  | {
      available: false;
      /** Something connected and replied, but not with a JSON object. */
      otherAnswered?: true;
    }
  | { available: true; status: number; body: Record<string, unknown> };

interface WireRequest {
  method: string;
  path: string;
  payload: string | undefined;
  timeoutMs: number;
}

/**
 * One HTTP exchange with the remote script on `port`.
 * @param wire - The request on the wire
 * @param wire.method - GET or POST
 * @param wire.path - Route plus query string
 * @param wire.payload - JSON body, if any
 * @param wire.timeoutMs - How long to wait for the answer
 * @param port - Where to send it
 * @returns The reply, or `available: false`
 */
export function sendWireRequest(
  { method, path, payload, timeoutMs }: WireRequest,
  port: number,
): Promise<WireReply> {
  return new Promise<WireReply>((resolve, reject) => {
    let connected = false;
    let settled = false;
    const timers: NodeJS.Timeout[] = [];

    const settle = (outcome: () => void): void => {
      if (!settled) {
        settled = true;

        for (const timer of timers) {
          clearTimeout(timer);
        }

        outcome();
      }
    };

    const request = http.request(
      {
        host: HOST,
        port,
        method,
        path,
        agent: false,
        headers:
          payload == null
            ? {}
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              },
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", (error) =>
          settle(() => reject(new RemoteScriptConnectionLost(error))),
        );
        response.on("end", () => {
          const parsed = jsonObject(Buffer.concat(chunks).toString("utf8"));

          settle(() =>
            resolve(
              parsed == null
                ? { available: false, otherAnswered: true }
                : {
                    available: true,
                    status: response.statusCode ?? 0,
                    body: parsed,
                  },
            ),
          );
        });
      },
    );

    timers.push(
      setTimeout(() => {
        if (!connected) {
          settle(() => resolve({ available: false }));
          request.destroy();
        }
      }, CONNECT_TIMEOUT_MS),
      setTimeout(() => {
        // Not connected yet means nothing was sent.
        settle(() =>
          reject(
            new RemoteScriptTimeout(
              connected
                ? `Live's browser did not answer within ${timeoutMs / 1000}s`
                : "ran out of time before connecting to Live's browser",
              connected,
            ),
          ),
        );
        request.destroy();
      }, timeoutMs),
    );

    request.on("socket", (socket) => {
      socket.once("connect", () => {
        connected = true;
      });
    });
    request.on("error", (error) => {
      settle(() =>
        connected
          ? reject(new RemoteScriptConnectionLost(error))
          : resolve({ available: false }),
      );
    });
    request.end(payload);
  });
}

/**
 * Parse a reply body.
 * @param text - The body
 * @returns The JSON object, or null when the body isn't one
 */
function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);

    return value != null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
