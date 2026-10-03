// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What an update-clip batch reports when the request's deadline cuts it short:
// every clip it didn't reach keeps an entry (ADR-0042).

import {
  buildClipResultObject,
  type ClipResult,
} from "#src/tools/clip/helpers/clip-results.ts";
import { isDeadlineExceeded } from "#src/shared/max/v8-request-deadline.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import {
  REQUEST_OUT_OF_TIME,
  unreachedDetail,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type ClipReasons,
  reportClipReasons,
} from "../entries/clip-reasons.ts";
import { type ClipTargets, refuseTarget } from "../entries/clip-targets.ts";
import { type ClipUpdatePlan } from "../plan-clip-update.ts";

/** What a batch has to know to stop at the deadline. */
export interface BatchDeadline {
  deadline: number | null;
  plan: ClipUpdatePlan;
  targets: ClipTargets;
  /** What each clip's turn wrote, in clip order; written to for a cut clip. */
  resultsPerClip: ClipResult[][];
  reasons: ClipReasons;
}

/**
 * Whether the batch should stop here, giving each clip it didn't reach its own
 * entry. A clip the split already cut changed the Set, so it keeps the entry a
 * finished split gives it, saying the rest of its update never ran. Any other
 * clip is refused.
 * @param batch - The deadline, the plan, and where each clip's entry goes
 * @param step - How far the loop got
 * @returns true when time is up
 */
export function stopBatch(batch: BatchDeadline, step: number): boolean {
  const { deadline, plan, targets, resultsPerClip, reasons } = batch;
  const { clips, moveOrder } = plan;

  if (!isDeadlineExceeded(deadline)) {
    return false;
  }

  for (const index of moveOrder.slice(step)) {
    const clip = clips[index] as LiveAPI;

    if (reasons.landed.has(clip.id)) {
      const entry = buildClipResultObject(
        clip.id,
        null,
        objectPathForApi(clip),
      );

      // What the split already had to say goes first, then why the rest of the
      // update never ran.
      reportClipReasons(reasons, clip.id, [entry]);
      appendDetail(
        entry,
        `${REQUEST_OUT_OF_TIME}; the rest of this update did not run`,
      );
      resultsPerClip[index] = [entry];
    } else {
      refuseTarget(
        targets.unused,
        targets.named,
        plan.slots[index] as number,
        unreachedDetail("clip", "not updated"),
      );
    }
  }

  return true;
}
