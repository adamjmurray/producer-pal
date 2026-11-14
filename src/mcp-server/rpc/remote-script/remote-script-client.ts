// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Requests to the Producer Pal remote script (remote-script/), which runs
// inside Live: finding its port, checking its version, and telling it from
// another program on the port.

import { REMOTE_SCRIPT_HTTP_TIMEOUT_MS } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { remoteScriptReplyWait } from "#src/tools/shared/remote-script/remote-script-wait.ts";
import {
  type RemoteScriptAsker,
  type RemoteScriptUnavailable,
} from "#src/tools/shared/remote-script/outdated-remote-script.ts";
import { RemoteScriptTimeout } from "./remote-script-errors.ts";
import {
  forgetRemoteScriptPort as forgetPort,
  remoteScriptPortFromEnv,
  resolveRemoteScriptPort as resolvePort,
  type ProbeResult,
} from "./port/remote-script-port.ts";
import {
  outdatedFields,
  outdatedScript,
  unknownRouteReason,
} from "./port/remote-script-version.ts";
import { notRunning, pingFromReply } from "./remote-script-ping-reply.ts";
import { sendWireRequest, type WireReply } from "./port/remote-script-wire.ts";

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
  /** Who is asking, which words an out-of-date reason. Defaults to the device. */
  asker?: RemoteScriptAsker;
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
 * @param request.asker - Who is asking, which words an out-of-date reason
 * @returns The reply, or `available: false`
 * @throws RemoteScriptTimeout when the remote script took the connection but
 *   didn't answer in time, or `expiresInMs` was used up before the request left
 * @throws RemoteScriptConnectionLost when the connection broke after it was made
 */
export async function remoteScriptRequest(
  request: RemoteScriptRequest,
): Promise<RemoteScriptReply> {
  const { expiresInMs, port, asker } = request;

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

  const send = (target: number, elapsedMs: number): Promise<WireReply> =>
    sendWithin(request, target, elapsedMs);

  const fixedPort = port ?? remoteScriptPortFromEnv();

  const found =
    fixedPort == null ? await findPort() : { port: fixedPort, info: null };
  const target = found.port;

  // Another program holds the port: it must not get the request.
  if (found.info?.kind === "other") {
    return { available: false, otherAnswered: true };
  }

  // A probe (`port`) is how the version is learned, so it isn't held to it. A
  // fixed port is a test's: it is checked only against a version already known.
  // A version that reads too old is asked for again, since the script may have
  // been replaced on the same port; the call is refused either way. Finding
  // the port may have just pinged it.
  if (fixedPort == null && found.info == null) {
    await learnScriptVersion(
      target,
      expiresInMs == null ? null : expiresInMs - (Date.now() - started),
    );
  }

  const outdated =
    port == null
      ? outdatedFields(
          (manage) =>
            outdatedScript(cachedScriptVersion(target), asker, manage),
          asker,
        )
      : null;

  if (outdated != null) {
    return { available: false, ...outdated };
  }

  const reply = await send(
    target,
    fixedPort == null ? Date.now() - started : 0,
  );
  const fromScript = async (answer: RemoteScriptAnswer): Promise<boolean> =>
    answer.status < 400 || (await stillOurs(target));

  if (!reply.available) {
    // Nothing listening, or another program by now: Live may have restarted
    // onto another port.
    if (fixedPort == null) {
      forgetRemoteScriptPort();
    }

    return reply;
  }

  if (fixedPort == null && found.info == null && !(await fromScript(reply))) {
    forgetRemoteScriptPort();

    return { available: false, otherAnswered: true };
  }

  // A script too old to have the route says so; no other 404 does.
  const unknown = outdatedFields(
    (manage) =>
      unknownRouteReason(
        reply.status,
        reply.body,
        cachedScriptVersion(target),
        asker,
        manage,
      ),
    asker,
  );

  return unknown == null ? reply : { available: false, ...unknown };
}

/**
 * The port requests go to. Probes 3349 first, so a second Live's script on
 * another port doesn't take over this one's requests. A port the script
 * answered on is kept until a call finds it gone from there.
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
 * Ping a port to learn its script's version, unless it is known and new
 * enough. The version is kept with the port: one ping, not one per call. Calls
 * for the same port share a ping; one for another port makes its own.
 * @param port - The port requests go to
 * @param leftMs - How much of the caller's time is left, or null for no limit;
 *   the ping waits no longer, and isn't made when nothing is left
 */
async function learnScriptVersion(
  port: number,
  leftMs: number | null,
): Promise<void> {
  if (!versionNeedsLearning(port) || (leftMs != null && leftMs <= 0)) {
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

/** What `/ping` reports. Versions are null when nothing of ours answered. */
export interface RemoteScriptPing {
  running: boolean;
  liveVersion: string | null;
  scriptVersion: string | null;
  /** The build ID of what Live loaded (see remote-script-build.ts). */
  scriptBuild: string | null;
  /** The commit of the device that installed it. Diagnostic only. */
  scriptCommit: string | null;
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

  if (kind === "none" || kind === "other") {
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
    : {
        available: false,
        outdated: reply.outdated,
        ...(reply.outdatedWithoutManage != null && {
          outdatedWithoutManage: reply.outdatedWithoutManage,
        }),
      };
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
 * Send a request, giving Live what is left of the caller's time.
 * @param request - What to send
 * @param target - The port to send to
 * @param elapsedMs - How much of `expiresInMs` finding the port used
 * @returns The reply, or `available: false`
 * @throws RemoteScriptTimeout when finding the port used the time up
 */
function sendWithin(
  request: RemoteScriptRequest,
  target: number,
  elapsedMs: number,
): Promise<WireReply> {
  const {
    method = "GET",
    route,
    query,
    body,
    timeoutMs = REMOTE_SCRIPT_HTTP_TIMEOUT_MS,
    expiresInMs,
  } = request;
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

  return sendWireRequest(
    { method, path: `${route}${search}`, payload, timeoutMs: wait },
    target,
  );
}

/**
 * Whether the script is still what answers on a kept port. An error reply
 * could come from another program that took the port since its last ping, and
 * it would get every later request too. A ping too slow to answer counts as
 * the script: Live is busy, not gone.
 * @param port - The port to ask
 * @returns False when another program, or nothing, answers there
 */
async function stillOurs(port: number): Promise<boolean> {
  const { kind } = await pingPort(port);

  return kind === "ours" || kind === "slow";
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

    const ping = pingFromReply(reply.status, reply.body);

    return ping == null
      ? { ping: notRunning(port), kind: "other" }
      : { ping, kind: "ours" };
  } catch (error) {
    return {
      ping: notRunning(),
      kind: error instanceof RemoteScriptTimeout ? "slow" : "none",
    };
  }
}
