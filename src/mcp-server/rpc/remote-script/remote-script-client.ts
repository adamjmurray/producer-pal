// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// HTTP to the Producer Pal remote script (remote-script/), which runs inside
// Live. node:http with no keep-alive agent: Node's default fetch dispatcher can
// stall a request by ~500ms.

import http from "node:http";
import { REMOTE_SCRIPT_HTTP_TIMEOUT_MS } from "#src/tools/device/create/helpers/remote-script-contract.ts";

const HOST = "127.0.0.1";
const DEFAULT_PORT = 3349;

/** A remote script that hasn't taken the connection by now isn't running. */
const CONNECT_TIMEOUT_MS = 1000;

/** Skills assembly pings on every connect, so the ping can't wait long. */
const PING_TIMEOUT_MS = 1000;

/** What the remote script answered, or that nothing did. */
export type RemoteScriptReply =
  | { available: false }
  | { available: true; status: number; body: Record<string, unknown> };

/** An answer from the remote script, as opposed to silence. */
export type RemoteScriptAnswer = Extract<
  RemoteScriptReply,
  { available: true }
>;

export interface RemoteScriptRequest {
  method?: "GET" | "POST";
  /** The remote script's route, e.g. "/list" */
  route: string;
  query?: Record<string, string>;
  body?: object;
  timeoutMs?: number;
}

/**
 * Send one request to the remote script.
 *
 * Anything that isn't the remote script answering — a refused or slow
 * connection, or a reply that isn't a JSON object from some other program on
 * the port — comes back `available: false`, so callers fall back to what they
 * did without it.
 * @param request - What to send
 * @param request.method - GET or POST
 * @param request.route - The remote script's route, e.g. "/list"
 * @param request.query - Query string params
 * @param request.body - JSON body
 * @param request.timeoutMs - How long to wait for the answer
 * @returns The reply, or `available: false`
 * @throws Error when the remote script took the connection but didn't answer in time
 */
export function remoteScriptRequest({
  method = "GET",
  route,
  query,
  body,
  timeoutMs = REMOTE_SCRIPT_HTTP_TIMEOUT_MS,
}: RemoteScriptRequest): Promise<RemoteScriptReply> {
  const payload = body == null ? undefined : JSON.stringify(body);
  const search = query == null ? "" : `?${new URLSearchParams(query)}`;

  return new Promise((resolve, reject) => {
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
        port: remoteScriptPort(),
        method,
        path: `${route}${search}`,
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
        response.on("error", (error) => settle(() => reject(error)));
        response.on("end", () => {
          const parsed = jsonObject(Buffer.concat(chunks).toString("utf8"));

          settle(() =>
            resolve(
              parsed == null
                ? { available: false }
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
        settle(() =>
          reject(
            new Error(
              `Live's browser did not answer within ${timeoutMs / 1000}s`,
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
      settle(() => (connected ? reject(error) : resolve({ available: false })));
    });
    request.end(payload);
  });
}

/** What `/ping` reports. Versions are null on a script too old to send them. */
export interface RemoteScriptPing {
  running: boolean;
  liveVersion: string | null;
  scriptVersion: string | null;
}

/**
 * Ask the remote script whether it's running, and which Live and script
 * versions it is. Never throws.
 * @returns The ping reply, all-null when nothing answered
 */
export async function remoteScriptPing(): Promise<RemoteScriptPing> {
  try {
    const reply = await remoteScriptRequest({
      route: "/ping",
      timeoutMs: PING_TIMEOUT_MS,
    });

    if (!reply.available || reply.status !== 200 || reply.body.ok !== true) {
      return notRunning();
    }

    return {
      running: true,
      liveVersion: stringOrNull(reply.body.live_version),
      scriptVersion: stringOrNull(reply.body.script_version),
    };
  } catch {
    return notRunning();
  }
}

/**
 * Whether the remote script is running. Never throws.
 * @returns True when it answered its ping
 */
export async function pingRemoteScript(): Promise<boolean> {
  const ping = await remoteScriptPing();

  return ping.running;
}

/**
 * The error text a failed reply carries.
 * @param reply - A reply that wasn't a 200
 * @returns The remote script's own error, or the status
 */
export function replyError(reply: RemoteScriptAnswer): string {
  return typeof reply.body.error === "string"
    ? reply.body.error
    : `Live's browser answered with status ${reply.status}`;
}

// --- Helpers below main exports ---

/**
 * A ping reply for a remote script that isn't there.
 * @returns The all-null reply
 */
function notRunning(): RemoteScriptPing {
  return { running: false, liveVersion: null, scriptVersion: null };
}

/**
 * Narrow a reply field to a string.
 * @param value - The raw field
 * @returns The string, or null when it isn't one
 */
function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * The remote script's port: PPAL_REMOTE_SCRIPT_PORT, else 3349. Read per call,
 * so a test can point it at its own server.
 * @returns The port
 */
function remoteScriptPort(): number {
  const raw = process.env.PPAL_REMOTE_SCRIPT_PORT;
  const port = raw == null || raw.trim() === "" ? Number.NaN : Number(raw);

  return Number.isInteger(port) && port >= 0 ? port : DEFAULT_PORT;
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
