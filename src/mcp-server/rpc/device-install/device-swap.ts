// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Swapping the running device for the User Library copy, through the remote
// script's /replace-producer-pal (the route the portal's update uses).
//
// The request comes from the device that is being replaced. Live unloads it
// inside the swap, so this server usually dies before the remote script's
// answer arrives: a dropped connection is the expected sign of success, not a
// failure. Nothing here may hold state that has to outlive the swap. The chat
// UI waits for a new device to answer instead.

import { outdatedFor } from "#src/tools/shared/remote-script/outdated-remote-script.ts";
import { requestWithBrowserRetry } from "#src/portal/setup/browser-retry-request.ts";
import { SETUP_BUDGET_MS } from "#src/portal/setup/setup-deadline.ts";
import { SetupFailed } from "#src/portal/setup/setup-failure.ts";
import {
  mayHaveSwapped,
  type ReplacedTrack,
  trackOf,
} from "#src/portal/update/replace-device-request.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import {
  type RemoteScriptPing,
  remoteScriptPing,
  type RemoteScriptReply,
  type RemoteScriptRequest,
  remoteScriptRequest,
  replyError,
} from "../remote-script/remote-script-client.ts";
import { RemoteScriptTimeout } from "../remote-script/remote-script-errors.ts";
import { deviceSwapCheck } from "./device-swap-check.ts";
import { deviceInstallStatus } from "./device-install-status.ts";

/**
 * - `swapping`: Live swapped it, or answered as if it will.
 * - `unconfirmed`: Live didn't say, so it may have swapped (or be about to).
 * - `refused`: Live's Set is unchanged: the swap isn't allowed, or Live said no.
 * - `failed`: Live's Set is unchanged: the remote script couldn't be reached.
 */
export type DeviceSwap =
  | { status: "swapping"; track?: ReplacedTrack }
  | { status: "unconfirmed" | "refused" | "failed"; error: string };

/** What the swap reaches out to. */
export interface SwapDeps {
  ping: () => Promise<RemoteScriptPing>;
  request: (request: RemoteScriptRequest) => Promise<RemoteScriptReply>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const REAL_DEPS: SwapDeps = {
  ping: remoteScriptPing,
  request: remoteScriptRequest,
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** A request that went out, so Live may have swapped the device. */
class MaySwap extends SetupFailed {}

/**
 * Swap the running device for the copy in the User Library, replacing it in
 * the Live Set. The Set keeps pointing at the old file until it's saved.
 *
 * @param userLibrary - Path to Live's User Library folder, a leading `~` allowed
 * @param deps - What the swap reaches out to
 * @returns What Live did, or why it was not asked to
 * @throws {UserLibraryFolderError} When userLibrary isn't an absolute path to an existing folder, before anything is asked
 */
export async function swapForLibraryCopy(
  userLibrary: string,
  deps: SwapDeps = REAL_DEPS,
): Promise<DeviceSwap> {
  const status = await deviceInstallStatus(userLibrary);
  const check = await deviceSwapCheck(status, deps.ping);

  if (!check.allowed) {
    return { status: "refused", error: check.reason };
  }

  try {
    const reply = await requestWithBrowserRetry(
      {
        route: "/replace-producer-pal",
        body: { path: check.copy },
        thrown: requestThrew,
        // Only the chat UI's Installation tab reaches this, so a person reads it:
        // no tool name.
        unavailable: (unavailable) =>
          new SetupFailed(
            `${outdatedFor(unavailable, false) ?? "The remote script stopped answering"}, so the Live Set was not changed.`,
          ),
      },
      deps,
      deps.now() + SETUP_BUDGET_MS,
    );

    return answer(reply);
  } catch (error) {
    return {
      status: error instanceof MaySwap ? "unconfirmed" : "failed",
      error: errorMessage(error),
    };
  }
}

/**
 * @param reply - What the remote script answered
 * @returns The swap's outcome
 */
function answer(
  reply: Extract<RemoteScriptReply, { available: true }>,
): DeviceSwap {
  if (reply.status === 200) {
    const track = trackOf(reply.body);

    return track == null
      ? { status: "swapping" }
      : { status: "swapping", track };
  }

  const text = replyError(reply);

  if (mayHaveSwapped(reply)) {
    return {
      status: "unconfirmed",
      error: `Live reported a problem while swapping the device (${text}), so it may have been swapped.`,
    };
  }

  return {
    status: "refused",
    error:
      reply.status === 404
        ? `Live's browser hasn't found the User Library copy yet (${text}). Try again in a moment.`
        : `Live couldn't swap the device: ${text}. The Live Set was not changed.`,
  };
}

/**
 * @param error - What the request to the remote script threw
 * @returns The failure: unconfirmed when the request went out
 */
function requestThrew(error: unknown): SetupFailed {
  const sent = !(error instanceof RemoteScriptTimeout) || error.sent;

  return sent
    ? new MaySwap(
        `Live didn't answer the request to swap the device (${errorMessage(error)}), so it may have been swapped.`,
        { cause: error },
      )
    : new SetupFailed(
        "Ran out of time before the request reached Live, so the Live Set was not changed.",
        { cause: error },
      );
}
