// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type RemoteScriptAnswer,
  type RemoteScriptReply,
} from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { type SetupFailed } from "./setup-failure.ts";

/** Live's browser can take a few seconds to see a file just written. */
const BROWSER_RETRY_MS = 500;
const BROWSER_RETRY_LIMIT_MS = 15_000;

/** How long Live may leave a device load queued, which is also how long we wait. */
const DEVICE_LOAD_EXPIRES_MS = 20_000;

/** A route that takes a device file's path, and how to word what goes wrong. */
export interface BrowserRequest {
  route: string;
  body: object;
  /** The failure for a request that threw */
  thrown: (error: unknown) => SetupFailed;
  /** The failure for a remote script that didn't answer */
  unavailable: (
    reply: Exclude<RemoteScriptReply, { available: true }>,
  ) => SetupFailed;
}

/**
 * POST a device file's path to the remote script. A 404 means Live's browser
 * hasn't seen the new file yet, so it is asked again for a while.
 * @param request - The route, body and failure wording
 * @param deps - The remote script, and the clock
 * @returns The answer: a success, or the first failure that isn't a not-found
 *   (or the not-found it still got when the time was up)
 * @throws SetupFailed when the request threw or nothing answered
 */
export async function requestWithBrowserRetry(
  request: BrowserRequest,
  deps: Pick<OfflineDeps, "request" | "now" | "sleep">,
): Promise<RemoteScriptAnswer> {
  const started = deps.now();

  for (;;) {
    const reply = await send(request, deps);

    if (reply.status === 404 && deps.now() - started < BROWSER_RETRY_LIMIT_MS) {
      await deps.sleep(BROWSER_RETRY_MS);
      continue;
    }

    return reply;
  }
}

/**
 * @param request - The route, body and failure wording
 * @param deps - The remote script
 * @returns The remote script's answer
 * @throws SetupFailed when it threw or didn't answer
 */
async function send(
  request: BrowserRequest,
  deps: Pick<OfflineDeps, "request">,
): Promise<RemoteScriptAnswer> {
  const { route, body, thrown, unavailable } = request;
  let reply: RemoteScriptReply;

  try {
    reply = await deps.request({
      method: "POST",
      route,
      body,
      expiresInMs: DEVICE_LOAD_EXPIRES_MS,
    });
  } catch (error) {
    throw thrown(error);
  }

  if (!reply.available) {
    throw unavailable(reply);
  }

  return reply;
}
