// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Ask a remote-script route about many devices at once: a chunk of devices per
// call, one answer per device, and no throw. Shared by the reads that add
// detail Max can't give (rack macros, Simpler pitch bend ranges).

import { errorMessage } from "#src/shared/error-message.ts";
import { REQUEST_OUT_OF_TIME } from "#src/tools/shared/validation/lists/named-targets.ts";
import { REMOTE_SCRIPT_UNANSWERED } from "./remote-script-route-contract.ts";
import { remoteScriptRoute } from "./remote-script-route.ts";

/** Why one device couldn't be read: the remote script said so, or didn't answer. */
export interface Unreadable {
  unreadable: string;
}

/**
 * Whether an answer says the route stalled (no time, or no reply), which the
 * next call would meet too.
 * @param answer - One answer from `askAboutDevices`
 * @returns True for an answer that carries a stall
 */
export function isStalled(answer: object): boolean {
  return (
    "unreadable" in answer &&
    (answer.unreadable === REMOTE_SCRIPT_UNANSWERED ||
      answer.unreadable === REQUEST_OUT_OF_TIME)
  );
}

/** A route that answers one entry per device path it was sent. */
export interface DeviceBatchRoute<Result, Answer extends object> {
  /** The Node route that forwards to the remote script */
  route: string;
  /** The most devices one call takes */
  maxPerCall: number;
  /** What to say when the remote script isn't running */
  missing: string;
  /** The result's entries, one per device asked about, in order */
  entries: (result: Result) => ReadonlyArray<Answer | { error: string }>;
}

/**
 * Ask the remote script about each device, a chunk at a time. Never throws: a
 * device it can't answer for carries the reason.
 * @param batch - The route to ask
 * @param devices - The devices to ask about
 * @param deadline - The request deadline from ToolContext, if any
 * @param maxWaitMs - A shorter wait than the usual one for each call, for a
 *   caller that can do without the answer
 * @returns One answer per device, in order; null when the remote script isn't
 *   running, so there is nothing to ask
 */
export async function askAboutDevices<Result, Answer extends object>(
  batch: DeviceBatchRoute<Result, Answer>,
  devices: LiveAPI[],
  deadline: number | null | undefined,
  maxWaitMs?: number,
): Promise<Array<Answer | Unreadable> | null> {
  const answers: Array<Answer | Unreadable> = [];
  let stalled: string | undefined;

  for (let at = 0; at < devices.length; at += batch.maxPerCall) {
    const chunk = devices.slice(at, at + batch.maxPerCall);

    // A route that stalled once would stall the rest the same way.
    if (stalled != null) {
      const unreadable: Unreadable = { unreadable: stalled };

      answers.push(...chunk.map(() => unreadable));
      continue;
    }

    const asked = await askAboutChunk(batch, chunk, deadline, maxWaitMs);

    if (asked == null) {
      return null;
    }

    stalled = asked.stalled;
    answers.push(...asked.answers);
  }

  return answers;
}

// --- Helpers below main exports ---

/**
 * One remote-script call for a chunk of devices.
 * @param batch - The route to ask
 * @param devices - At most `batch.maxPerCall` devices
 * @param deadline - The request deadline from ToolContext, if any
 * @param maxWaitMs - A shorter wait than the usual one, if any
 * @returns One answer per device, and why the route stalled if it did; null
 *   when the remote script isn't running
 */
async function askAboutChunk<Result, Answer extends object>(
  batch: DeviceBatchRoute<Result, Answer>,
  devices: LiveAPI[],
  deadline: number | null | undefined,
  maxWaitMs: number | undefined,
): Promise<{ answers: Array<Answer | Unreadable>; stalled?: string } | null> {
  try {
    const outcome = await remoteScriptRoute<Result>(
      batch.route,
      { devicePaths: devices.map((device) => device.path) },
      deadline,
      batch.missing,
      maxWaitMs,
    );

    if (!outcome.ok) {
      if (!outcome.available) {
        return null;
      }

      return {
        answers: devices.map(() => ({ unreadable: outcome.reason })),
        ...(outcome.stalled != null && { stalled: outcome.reason }),
      };
    }

    const entries = batch.entries(outcome.result);

    return {
      answers: devices.map((_device, i) => {
        const entry = entries[i];

        if (entry == null) {
          return { unreadable: "the remote script gave no answer for it" };
        }

        return "error" in entry ? { unreadable: entry.error } : entry;
      }),
    };
  } catch (error) {
    return {
      answers: devices.map(() => ({ unreadable: errorMessage(error) })),
    };
  }
}
