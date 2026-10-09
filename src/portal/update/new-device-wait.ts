// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isNewerVersion } from "#src/shared/version-check.ts";
import { type OfflineDeps } from "../offline/offline-deps.ts";
import { pollUntil } from "../setup/poll-until.ts";
import { SetupFailed } from "../setup/setup-failure.ts";
import { type ReplacedTrack } from "./replace-device-request.ts";
import { type RunningDevice } from "./running-device.ts";

/** What is known about the device that replaced the old one. */
export interface Replacement {
  /** The version that was running before */
  from: string;
  /** The version the new device file names, when it names one */
  expected?: string;
  track?: ReplacedTrack;
}

/**
 * Reconnect until the server that answers is the new one. The old server dies
 * with the swap but may still answer for a moment, so an answer that names the
 * old version isn't taken.
 * @param replacement - What was replaced, and by what
 * @param device - The bridge's connection to the device
 * @param deps - The clock
 * @returns The version the new device reports
 * @throws SetupFailed when no new server answers in time
 */
export async function waitForNewDevice(
  replacement: Replacement,
  device: RunningDevice,
  deps: Pick<OfflineDeps, "now" | "sleep">,
): Promise<string> {
  const { from, expected, track } = replacement;
  let seen: string | undefined;

  const answered = await pollUntil(async () => {
    device.reset();

    try {
      await device.connect();
    } catch {
      return false;
    }

    seen = device.version();

    return seen != null && isNew(seen, from, expected);
  }, deps);

  if (answered && seen != null) {
    return seen;
  }

  device.reset();

  throw new SetupFailed(notAnsweringYet(seen, track));
}

/**
 * @param seen - The version a server reported
 * @param from - The version that was running before
 * @param expected - The version the new device file names, if it does
 * @returns True when the server is the new device
 */
function isNew(seen: string, from: string, expected?: string): boolean {
  return isNewerVersion(from, seen) || (expected !== from && seen === expected);
}

/**
 * @param seen - The last version a server reported, if any answered
 * @param track - Where the device is, if known
 * @returns What state Live is in and what to do
 */
function notAnsweringYet(
  seen: string | undefined,
  track: ReplacedTrack | undefined,
): string {
  const where = track == null ? "" : ` on ${track.path} "${track.name}"`;
  const replaced = `Live replaced the Producer Pal device${where}`;

  return seen == null
    ? `${replaced}, but the new one hasn't answered yet. Wait a few seconds, then call ppal-connect. Don't call update-producer-pal again.`
    : `${replaced}, but the old version (${seen}) is still answering. Ask the user to check the Producer Pal device in Live, then call ppal-connect.`;
}
