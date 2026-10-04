// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  REMOTE_SCRIPT_UNANSWERED,
  type RouteReply,
} from "#src/tools/shared/remote-script/remote-script-route-contract.ts";
import {
  type RemoteScriptReply,
  remoteScriptRequest,
} from "../remote-script-client.ts";

/**
 * Forward one request to a remote-script route that V8 calls for its result:
 * clip automation, rack macros.
 * @param route - The remote script's route, e.g. "/envelope/list"
 * @param body - The JSON body to POST, in the remote script's spelling
 * @param notFoundMeansMissing - Whether a 404 is the bridge not knowing the
 *   route (an older remote script), which counts as no remote script
 * @returns The remote script's JSON, an error worded for the model, or
 *   `available: false` when nothing answered
 * @throws Error when the remote script took the request but never answered
 */
export async function forwardRemoteScriptRequest(
  route: string,
  body: Record<string, unknown>,
  notFoundMeansMissing = false,
): Promise<RouteReply<Record<string, unknown>>> {
  let reply: RemoteScriptReply;

  try {
    reply = await remoteScriptRequest({ method: "POST", route, body });
  } catch {
    // The client words this for the browser routes, not for these.
    throw new Error(REMOTE_SCRIPT_UNANSWERED);
  }

  if (!reply.available || (notFoundMeansMissing && reply.status === 404)) {
    return { available: false };
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
  };
}
