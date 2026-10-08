// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// HTTP to the Producer Pal remote script (remote-script/), which runs inside
// Live. node:http with no keep-alive agent: Node's default fetch dispatcher can
// stall a request by ~500ms.

import http from "node:http";
import { REMOTE_SCRIPT_HTTP_TIMEOUT_MS } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { remoteScriptReplyWait } from "#src/tools/shared/remote-script/remote-script-wait.ts";
import { type RemoteScriptUnavailable } from "#src/tools/shared/remote-script/outdated-remote-script.ts";
import {
  forgetRemoteScriptPort as forgetPort,
  remoteScriptPortFromEnv,
  resolveRemoteScriptPort as resolvePort,
  type ProbeResult,
} from "./port/remote-script-port.ts";
import {
  outdatedScript,
  unknownRouteReason,
} from "./port/remote-script-version.ts";

const HOST = "127.0.0.1";

/**
 * Dev switch (POST /config `remoteScriptEnabled`): off makes every request here
 * answer `available: false` without touching the network, so each caller sees
 * a Live with no remote script. Lets an eval or e2e test run that case against
 * a Live that has it installed. Runtime only: it never reaches the device, and
 * a restart of the server turns it back on.
 */
let remoteScriptEnabled = true;

/**
 * Turn the remote script on or off for this process.
 * @param enabled - False to behave as if it isn't installed
 */
export function setRemoteScriptEnabled(enabled: boolean): void {
  remoteScriptEnabled = enabled;
}

/** A remote script that hasn't taken the connection by now isn't running. */
const CONNECT_TIMEOUT_MS = 1000;

/** Skills assembly pings on every connect, so the ping can't wait long. */
const PING_TIMEOUT_MS = 1000;

/**
 * What the remote script answered, or that nothing did. `available: false`
 * carries `outdated` when a script is running but too old: nothing was sent,
 * or it didn't know the route.
 */
export type RemoteScriptReply =
  | (RemoteScriptUnavailable & {
      /** Something connected and replied, but not with a JSON object. */
      otherAnswered?: true;
    })
  | { available: true; status: number; body: Record<string, unknown> };

/** An answer from the remote script, as opposed to silence. */
export type RemoteScriptAnswer = Extract<
  RemoteScriptReply,
  { available: true }
>;

/** The remote script took the connection but didn't answer in time. */
export class RemoteScriptTimeout extends Error {
  /**
   * Whether the request went out. If so, Live may have acted on it; if not,
   * nothing was asked of it.
   */
  readonly sent: boolean;

  constructor(message: string, sent: boolean) {
    super(message);
    this.name = "RemoteScriptTimeout";
    this.sent = sent;
  }
}

export interface RemoteScriptRequest {
  method?: "GET" | "POST";
  /** The remote script's route, e.g. "/list" */
  route: string;
  query?: Record<string, string>;
  body?: object;
  timeoutMs?: number;
  /**
   * How long Live may leave the job queued before skipping it. Sent as
   * `expires_in_ms`, and it sets the wait for the reply, so it replaces
   * `timeoutMs`. Nothing is sent when it is 0 or less.
   */
  expiresInMs?: number;
  /** Skip finding the port and use this one. For probing a port. */
  port?: number;
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
 * @param request.expiresInMs - How long Live may leave the job queued; sets the
 *   wait instead of `timeoutMs`
 * @param request.port - Send to this port instead of the resolved one
 * @returns The reply, or `available: false`
 * @throws RemoteScriptTimeout when the remote script took the connection but
 *   didn't answer in time, or `expiresInMs` was used up before the request left
 */
export async function remoteScriptRequest({
  method = "GET",
  route,
  query,
  body,
  timeoutMs = REMOTE_SCRIPT_HTTP_TIMEOUT_MS,
  expiresInMs,
  port,
}: RemoteScriptRequest): Promise<RemoteScriptReply> {
  if (!remoteScriptEnabled) {
    return { available: false };
  }

  if (expiresInMs != null && expiresInMs <= 0) {
    throw new RemoteScriptTimeout(
      "ran out of time before the request left",
      false,
    );
  }

  const started = Date.now();

  const send = (
    target: number,
    elapsedMs: number,
  ): Promise<RemoteScriptReply> => {
    // Finding the port took part of the time the caller gave us.
    const left = expiresInMs == null ? null : expiresInMs - elapsedMs;

    if (left != null && left <= 0) {
      return Promise.reject(
        new RemoteScriptTimeout("ran out of time finding the port", false),
      );
    }

    let wait = timeoutMs;
    let search = query == null ? "" : `?${new URLSearchParams(query)}`;
    let payload = body == null ? undefined : JSON.stringify(body);

    if (left != null) {
      wait = remoteScriptReplyWait(left);

      if (body == null) {
        search = `?${new URLSearchParams({ ...query, expires_in_ms: String(Math.floor(left)) })}`;
      } else {
        payload = JSON.stringify({ ...body, expires_in_ms: left });
      }
    }

    return sendRequest(
      { method, path: `${route}${search}`, payload, timeoutMs: wait },
      target,
    );
  };

  const fixedPort = port ?? remoteScriptPortFromEnv();

  const found =
    fixedPort == null ? await findPort() : { port: fixedPort, info: null };
  const target = found.port;

  // A probe (`port`) is how the version is learned, so it isn't held to it. A
  // fixed port is a test's: it is checked only against a version already known.
  // A version that reads too old is asked for again, since the script may have
  // been replaced on the same port; the call is refused either way. Finding
  // the port may have just pinged it.
  if (
    port == null &&
    fixedPort == null &&
    found.info == null &&
    versionNeedsLearning(target)
  ) {
    await learnScriptVersion(
      target,
      expiresInMs == null ? null : expiresInMs - (Date.now() - started),
    );
  }

  const outdated =
    port == null ? outdatedScript(cachedScriptVersion(target)) : null;

  if (outdated != null) {
    return { available: false, outdated };
  }

  const reply = await send(
    target,
    fixedPort == null ? Date.now() - started : 0,
  );

  if (!reply.available) {
    // Nothing listening: Live may have restarted onto another port. Any
    // answer, even an odd one, keeps the port.
    if (fixedPort == null && reply.otherAnswered !== true) {
      forgetRemoteScriptPort();
    }

    return reply;
  }

  // A script too old to have the route says so; no other 404 does.
  const unknown = unknownRouteReason(
    reply.status,
    reply.body,
    cachedScriptVersion(target),
  );

  return unknown == null ? reply : { available: false, outdated: unknown };
}

/**
 * The port requests go to. Probes 3349 first, so a second Live's script on
 * another port doesn't take over this one's requests, then keeps the port until
 * a call finds nothing listening there.
 * @returns The port to send to
 */
export async function resolveRemoteScriptPort(): Promise<number> {
  const found = await findPort();

  return found.port;
}

/**
 * Forget the port and the last good ping, so the next call looks again.
 */
export function forgetRemoteScriptPort(): void {
  forgetPort();
  lastGoodPing = null;
}

/** The last ping that showed our script, with the port it came from. */
let lastGoodPing: { port: number; ping: RemoteScriptPing } | null = null;

/**
 * The script's version from the last ping of this port.
 * @param port - The port requests go to
 * @returns The version, or null when that port hasn't answered a ping
 */
function cachedScriptVersion(port: number): string | null {
  return lastGoodPing?.port === port ? lastGoodPing.ping.scriptVersion : null;
}

/**
 * Whether the version on a port is unknown, or reads too old and so may have
 * changed since.
 * @param port - The port requests go to
 * @returns True when a ping is worth making
 */
function versionNeedsLearning(port: number): boolean {
  const version = cachedScriptVersion(port);

  return version == null || outdatedScript(version) != null;
}

/** The pings in flight to learn a version, per port, which calls share. */
const learning = new Map<number, Promise<PingResult>>();

/**
 * Ping a port to learn its script's version, which keeps the version with the
 * port: it costs one ping, not one per call. Calls for the same port share a
 * ping; one for another port makes its own.
 * @param port - The port requests go to
 * @param leftMs - How much of the caller's time is left, or null for no limit;
 *   the ping waits no longer, and isn't made when nothing is left
 */
async function learnScriptVersion(
  port: number,
  leftMs: number | null,
): Promise<void> {
  if (leftMs != null && leftMs <= 0) {
    return;
  }

  let ping = learning.get(port);

  if (ping == null) {
    ping = pingPort(
      port,
      leftMs == null ? PING_TIMEOUT_MS : Math.min(PING_TIMEOUT_MS, leftMs),
    ).finally(() => {
      learning.delete(port);
    });
    learning.set(port, ping);
  }

  await ping;
}

/** A ping and how the port answered it. */
interface PingResult {
  ping: RemoteScriptPing;
  kind: PingKind;
}

/**
 * Find the port, keeping the ping if it was just made on that port.
 * @returns The port, and the ping result when this call made one there
 */
function findPort(): Promise<{ port: number; info: PingResult | null }> {
  return resolvePort(async (port): Promise<ProbeResult<PingResult>> => {
    const result = await pingPort(port);

    return { kind: result.kind, info: result };
  });
}

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
function sendRequest(
  { method, path, payload, timeoutMs }: WireRequest,
  port: number,
): Promise<RemoteScriptReply> {
  return new Promise<RemoteScriptReply>((resolve, reject) => {
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
        response.on("error", (error) => settle(() => reject(error)));
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
        settle(() =>
          reject(
            new RemoteScriptTimeout(
              `Live's browser did not answer within ${timeoutMs / 1000}s`,
              true,
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

/** What `/ping` reports. Versions are null when nothing of ours answered. */
export interface RemoteScriptPing {
  running: boolean;
  liveVersion: string | null;
  scriptVersion: string | null;
  /**
   * The User Library the script runs from, which is where Live finds the files
   * it loads. Null when it doesn't say: a dev checkout, or a script too old to.
   */
  userLibrary: string | null;
  /** The port another program answered on, when it isn't our script. */
  otherOnPort: number | null;
}

/**
 * Ask the remote script whether it's running, and which Live and script
 * versions it is. Only a reply with `script_version` counts: anything else is
 * some other program on the port. A ping that gets no reply in time, from a
 * script that answered before, repeats that answer: Live is busy, not gone.
 * Never throws.
 * @returns The ping reply, all-null when nothing of ours answered
 */
export async function remoteScriptPing(): Promise<RemoteScriptPing> {
  const found = await findPort();
  // Finding the port may have just pinged it: don't ask Live twice.
  const { ping, kind } = found.info ?? (await pingPort(found.port));

  if (kind === "slow" && lastGoodPing?.port === found.port) {
    return lastGoodPing.ping;
  }

  if (kind === "none") {
    forgetRemoteScriptPort();
  }

  return ping;
}

/**
/**
 * An unavailable reply as a route answers it: no remote script to ask, and why
 * it is too old when one is running.
 * @param reply - The unavailable reply
 * @returns Just `available: false`, with `outdated` when set
 */
export function unavailableReply(
  reply: Extract<RemoteScriptReply, { available: false }>,
): RemoteScriptUnavailable {
  return reply.outdated == null
    ? { available: false }
    : { available: false, outdated: reply.outdated };
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

/** How a port answered a ping. "slow": it took the connection, then no reply. */
type PingKind = "ours" | "other" | "none" | "slow";

/**
 * Ping one port.
 * @param port - The port to ask
 * @param timeoutMs - How long to wait for the answer
 * @returns The ping, and what kind of answer it was
 */
async function pingPort(
  port: number,
  timeoutMs = PING_TIMEOUT_MS,
): Promise<PingResult> {
  const result = await askForPing(port, timeoutMs);

  if (result.kind === "ours") {
    lastGoodPing = { port, ping: result.ping };
  }

  return result;
}

/**
 * @param port - The port to ask
 * @param timeoutMs - How long to wait for the answer
 * @returns The ping, and what kind of answer it was
 */
async function askForPing(
  port: number,
  timeoutMs: number,
): Promise<PingResult> {
  try {
    const reply = await remoteScriptRequest({
      route: "/ping",
      timeoutMs,
      port,
    });

    if (!reply.available) {
      return reply.otherAnswered === true
        ? { ping: notRunning(port), kind: "other" }
        : { ping: notRunning(), kind: "none" };
    }

    const scriptVersion = stringOrNull(reply.body.script_version);

    if (
      reply.status !== 200 ||
      reply.body.ok !== true ||
      scriptVersion == null
    ) {
      return { ping: notRunning(port), kind: "other" };
    }

    return {
      ping: {
        running: true,
        liveVersion: stringOrNull(reply.body.live_version),
        scriptVersion,
        userLibrary: stringOrNull(reply.body.user_library),
        otherOnPort: null,
      },
      kind: "ours",
    };
  } catch (error) {
    return {
      ping: notRunning(),
      kind: error instanceof RemoteScriptTimeout ? "slow" : "none",
    };
  }
}

/**
 * A ping reply for a remote script that isn't there.
 * @param otherOnPort - The port something else answered on, if it did
 * @returns The all-null reply
 */
function notRunning(otherOnPort: number | null = null): RemoteScriptPing {
  return {
    running: false,
    liveVersion: null,
    scriptVersion: null,
    userLibrary: null,
    otherOnPort,
  };
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
