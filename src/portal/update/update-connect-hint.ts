// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { VERSION } from "#src/shared/config.ts";
import { isNewerVersion } from "#src/shared/version-check.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { olderDevice } from "./older-device.ts";
import { type RunningDevice } from "./running-device.ts";

// The first build that lists ppal-manage. Not "2.5.0": isNewerVersion puts
// every 2.5.0-rcN before 2.5.0, and those builds already have the tool.
const FIRST_MANAGE_VERSION = "2.5.0-rc1";

/** The longest the hint waits for the device: it is optional. */
export const UPDATE_HINT_MS = 5_000;

/**
 * @param deps - The clock
 * @param budgetEnd - When the call's budget ends, as a `now()` time
 * @returns When the hint's look at the device must be done: what is left of
 *   the budget, and no more than `UPDATE_HINT_MS`
 */
export function hintDeadline(
  deps: Pick<OfflineDeps, "now">,
  budgetEnd: number,
): number {
  return Math.min(budgetEnd, deps.now() + UPDATE_HINT_MS);
}

const UPDATE_BY_HAND_URL =
  "https://producer-pal.org/installation/upgrading#update-by-hand";

/**
 * Add a hint to a successful ppal-connect when the running device is older than
 * this portal. The portal says it, not the device: an old device can't learn
 * new wording. A failure to look just leaves the result as it was. Small-model
 * mode gets no hint: version management confuses local models.
 * @param result - What the device answered
 * @param call - The tool called, and whether this portal lists ppal-manage
 * @param call.name - The tool called
 * @param call.manageOffered - Whether this portal lists ppal-manage
 * @param device - The bridge's connection to the running device
 * @returns The result, with the hint appended when it applies
 */
export async function withUpdateHint<T extends object>(
  result: T,
  call: { name: string; manageOffered: boolean },
  device: RunningDevice,
): Promise<T> {
  const { content, isError } = result as {
    content?: unknown;
    isError?: unknown;
  };

  if (
    call.name !== "ppal-connect" ||
    isError === true ||
    !Array.isArray(content)
  ) {
    return result;
  }

  try {
    const older = await olderDevice(device);

    if (older == null || (await device.smallModelMode())) {
      return result;
    }

    return {
      ...result,
      content: [
        ...(content as unknown[]),
        { type: "text", text: hintFor(older, call.manageOffered) },
      ],
    };
  } catch {
    return result;
  }
}

/**
 * @param version - The running device's version
 * @param manageOffered - Whether this portal lists ppal-manage
 * @returns The text to append
 */
export function hintFor(version: string, manageOffered: boolean): string {
  const older = `The Producer Pal device (${version}) is older than this connector (${VERSION}).`;

  // An older device's tool list has no ppal-manage, so the client can't call it.
  const canCallManage =
    manageOffered && !isNewerVersion(version, FIRST_MANAGE_VERSION);

  return canCallManage
    ? `${older} Ask the user, then call ppal-manage action "update-producer-pal" to update it in place.`
    : `${older} Tell the user to update the Producer Pal device by hand: ${UPDATE_BY_HAND_URL}`;
}
