// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type RemoteScriptAnswer,
  type RemoteScriptReply,
  RemoteScriptTimeout,
  remoteScriptRequest,
  replyError,
} from "../remote-script-client.ts";

/**
 * POST a change to the remote script. A timeout comes back as the 504 the
 * remote script itself sends: `started` when the request went out, so Live may
 * have made the change.
 * @param request - What to send
 * @param request.route - The remote script's route
 * @param request.body - JSON body
 * @param request.expiresInMs - How long Live may leave the job queued
 * @returns The reply
 */
export async function requestChange(request: {
  route: string;
  body: object;
  expiresInMs: number;
}): Promise<RemoteScriptReply> {
  try {
    return await remoteScriptRequest({ method: "POST", ...request });
  } catch (error) {
    if (!(error instanceof RemoteScriptTimeout)) {
      throw error;
    }

    return {
      available: true,
      status: 504,
      body: { error: error.message, ...(error.sent ? { started: true } : {}) },
    };
  }
}

/**
 * The answer for a change the remote script didn't make.
 * @param reply - A reply that wasn't a 200
 * @returns The error, marked `unfinished` when Live may have started the change
 */
export function failedChange(reply: RemoteScriptAnswer): {
  available: true;
  error: string;
  unfinished?: true;
} {
  return {
    available: true,
    error: replyError(reply),
    ...(reply.body.started === true ? { unfinished: true as const } : {}),
  };
}

/**
 * How long the remote script may leave a change queued before skipping it.
 * @param args - The route args, with `expiresInMs`
 * @returns The expiry, in ms
 */
export function requireExpiry(args: unknown): number {
  const value = (args as Record<string, unknown> | null)?.expiresInMs;

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TypeError("expiresInMs must be a number, 0 or more");
  }

  return value;
}
