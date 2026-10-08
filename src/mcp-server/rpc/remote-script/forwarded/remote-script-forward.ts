// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  REMOTE_SCRIPT_UNANSWERED,
  type RouteReply,
} from "#src/tools/shared/remote-script/remote-script-route-contract.ts";
import {
  type RemoteScriptReply,
  remoteScriptRequest,
  unavailableReply,
} from "../remote-script-client.ts";
import {
  CONNECTION_LOST,
  RemoteScriptConnectionLost,
  RemoteScriptTimeout,
} from "../remote-script-errors.ts";

/**
 * Forward one request to a remote-script route that V8 calls for its result:
 * clip automation, rack macros, Simpler settings.
 *
 * A route that changes the Set passes `expiresInMs`: Live skips the job if it
 * hasn't started it by then. A failure after the request went out comes back
 * `unfinished`: a change may have landed, and a read would fail the same way.
 * @param route - The remote script's route, e.g. "/envelope/list"
 * @param body - The JSON body to POST, in the remote script's spelling
 * @param expiresInMs - For a change: how long Live may leave the job queued
 * @returns The remote script's JSON, an error worded for the model, or
 *   `available: false` when nothing answered
 * @throws Error when the remote script took the request but never answered
 */
export async function forwardRemoteScriptRequest(
  route: string,
  body: Record<string, unknown>,
  expiresInMs?: number,
): Promise<RouteReply<Record<string, unknown>>> {
  const change = expiresInMs != null;
  let reply: RemoteScriptReply;

  try {
    reply = await remoteScriptRequest({
      method: "POST",
      route,
      body,
      ...(change && { expiresInMs }),
    });
  } catch (error) {
    return failedRequest(error);
  }

  if (!reply.available) {
    return unavailableReply(reply);
  }

  if (reply.status === 200) {
    return { available: true, result: reply.body };
  }

  return {
    available: true,
    error:
      typeof reply.body.error === "string"
        ? reply.body.error
        : `the Producer Pal remote script answered with status ${reply.status}`,
    // The remote script says so when it had started the job.
    ...(change && reply.body.started === true && { unfinished: true as const }),
  };
}

// --- Helpers below main exports ---

/**
 * Word a request that threw. Only a request that went out and got no answer is
 * "did not answer in time".
 * @param error - What `remoteScriptRequest` threw
 * @returns An error reply, `unfinished` when the request went out
 * @throws Error when the request went out and nothing answered in time, or
 *   whatever else was thrown
 */
function failedRequest(error: unknown): {
  available: true;
  error: string;
  unfinished?: true;
} {
  if (error instanceof RemoteScriptTimeout) {
    if (error.sent) {
      throw new Error(REMOTE_SCRIPT_UNANSWERED);
    }

    // Nothing was sent, so nothing changed.
    return { available: true, error: error.message };
  }

  if (error instanceof RemoteScriptConnectionLost) {
    // Live may have acted on a change, and the next call would meet the same
    // loss, so the caller stops like it does for no answer.
    return { available: true, error: CONNECTION_LOST, unfinished: true };
  }

  throw error;
}
