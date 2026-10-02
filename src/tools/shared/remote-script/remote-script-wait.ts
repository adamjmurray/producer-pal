// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  REMOTE_SCRIPT_EXPIRY_MARGIN_MS,
  REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
} from "#src/tools/device/create/helpers/remote-script-contract.ts";

/**
 * How long V8 waits on a remote-script route: its usual wait, cut to what is
 * left of the request's time. V8 must answer before Node's tool timeout, or it
 * goes on creating devices the caller was told timed out, and a retry
 * duplicates them.
 * @param deadline - The request deadline, or null for none
 * @param reserveMs - Time to keep for work after the route answers
 * @returns The wait, or null when there's no time left to start
 */
export function remoteScriptWait(
  deadline: number | null | undefined,
  reserveMs = 0,
): number | null {
  if (deadline == null) {
    return REMOTE_SCRIPT_REQUEST_TIMEOUT_MS;
  }

  const left = deadline - Date.now() - reserveMs;

  return left > 0 ? Math.min(REMOTE_SCRIPT_REQUEST_TIMEOUT_MS, left) : null;
}

/**
 * When a change sent to the remote script expires: a bit under V8's wait, so a
 * job Live starts in time can answer before V8 gives up. The margin never takes
 * more than half a short wait.
 * @param waitMs - How long V8 waits for the route
 * @returns How long Live may leave the job queued, in ms
 */
export function remoteScriptExpiry(waitMs: number): number {
  return (
    waitMs - Math.min(REMOTE_SCRIPT_EXPIRY_MARGIN_MS, Math.ceil(waitMs / 2))
  );
}
