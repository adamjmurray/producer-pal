// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  replyError,
  type RemoteScriptAnswer,
} from "#src/mcp-server/rpc/remote-script/remote-script-client.ts";
import { RemoteScriptTimeout } from "#src/mcp-server/rpc/remote-script/remote-script-errors.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { requestWithBrowserRetry } from "../setup/browser-retry-request.ts";
import { SetupFailed } from "../setup/setup-failure.ts";

/** The track the replaced device sits on, as the remote script reports it. */
export interface ReplacedTrack {
  /** The track path: "t2", "rt0" or "mt" */
  path: string;
  name: string;
}

/**
 * Ask the remote script to swap the Set's Producer Pal device for the one in a
 * file. Live may have swapped it by the time anything but a refusal comes back,
 * so each failure says which.
 * @param path - Absolute path of the new device file
 * @param from - The version of the device being replaced
 * @param deps - The remote script, and the clock
 * @returns The track it sits on, when the remote script said
 * @throws SetupFailed when it didn't swap, or may have
 */
export async function replaceDevice(
  path: string,
  from: string,
  deps: Pick<OfflineDeps, "request" | "now" | "sleep">,
): Promise<ReplacedTrack | undefined> {
  const reply = await requestWithBrowserRetry(
    {
      route: "/replace-producer-pal",
      body: { path },
      thrown: (error) => requestThrew(error, from),
      unavailable: (unavailable) =>
        new SetupFailed(
          `${unavailable.outdated ?? "the remote script stopped answering"}. Nothing was changed.`,
        ),
    },
    deps,
  );

  if (reply.status === 200) {
    return trackOf(reply.body);
  }

  throw replyFailure(reply, from);
}

/**
 * @param from - The version that was running before the swap
 * @returns What to do to learn which device is running now
 */
function checkWhichRuns(from: string): string {
  return `Wait a few seconds, then call ppal-connect to see which version is running (it was ${from}). If it is still ${from}, call update-producer-pal again.`;
}

/**
 * @param error - What the request to the remote script threw
 * @param from - The version being replaced
 * @returns The failure to report, with what that means for the Set
 */
function requestThrew(error: unknown, from: string): SetupFailed {
  const sent = !(error instanceof RemoteScriptTimeout) || error.sent;

  return new SetupFailed(
    sent
      ? `Live didn't answer the request to replace Producer Pal (${errorMessage(error)}), so it may have been replaced. ${checkWhichRuns(from)}`
      : "ran out of time before the request reached Live, so nothing was changed. Call update-producer-pal again.",
    { cause: error },
  );
}

/**
 * @param reply - A /replace-producer-pal answer that wasn't a success
 * @param from - The version being replaced
 * @returns The failure to report
 */
function replyFailure(reply: RemoteScriptAnswer, from: string): SetupFailed {
  const text = replyError(reply);

  if (mayHaveSwapped(reply)) {
    return new SetupFailed(
      `Live reported a problem while replacing Producer Pal (${text}), so it may have been replaced. ${checkWhichRuns(from)}`,
    );
  }

  if (reply.status === 404) {
    return new SetupFailed(
      `Live's browser hasn't found the device file yet (${text}). Nothing was changed. Call update-producer-pal again in a moment.`,
    );
  }

  return new SetupFailed(
    `Live couldn't replace Producer Pal: ${text}. Nothing was changed.`,
  );
}

/**
 * The remote script refuses (400, 404, 409) before it touches the Set, and a
 * 504 without `started` means Live never ran the job. Any other failure came
 * after Live may have begun.
 * @param reply - The failure
 * @returns True when the swap may have happened
 */
function mayHaveSwapped(reply: RemoteScriptAnswer): boolean {
  if (reply.status === 504) {
    return reply.body.started === true;
  }

  return reply.status >= 500;
}

/**
 * @param body - A successful /replace-producer-pal answer
 * @returns The track it names, when it names one
 */
function trackOf(body: Record<string, unknown>): ReplacedTrack | undefined {
  const { track } = body;

  if (track == null || typeof track !== "object") {
    return undefined;
  }

  const { path, name } = track as Record<string, unknown>;

  return typeof path === "string" && typeof name === "string"
    ? { path, name }
    : undefined;
}
