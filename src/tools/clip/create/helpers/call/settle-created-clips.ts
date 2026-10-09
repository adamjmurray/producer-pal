// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { focusSelect } from "#src/tools/session/helpers/focus-select.ts";
import { reportClearedClips } from "#src/tools/shared/clip/landings/report-cleared-clips.ts";
import { type ClipSlotPosition } from "#src/tools/shared/validation/position-parsing.ts";
import {
  type Call,
  type Done,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { type ClipResultObject } from "../created-clip-result.ts";
import { launchCreatedClips } from "../create-clip-validation.ts";
import { type CreatePayload } from "./create-clip-targets.ts";
import { type CreateRun } from "./create-run.ts";
import { type CreateClipCall } from "./parse-create-call.ts";

type CreateDone = Done<CreatePayload, CreateClipCall, ClipResultObject>;

/** A clip the call made, as the view it is in and the entry that names it. */
interface MadeEntry {
  payload: CreatePayload;
  entry: ClipResultObject;
  index: number;
}

/**
 * Once every target has had its turn: say what a later write did to a clip made
 * earlier, launch what `auto` asks for, and focus the last clip made.
 * @param run - The call's shared state
 * @param done - What the call did
 * @param call - The call's shared state, for its warnings
 */
export function settleCreatedClips(
  run: CreateRun,
  done: CreateDone,
  call: Call,
): void {
  reportOverwritten(run, done);

  const { args } = done.checked;
  const made = madeEntries(done);

  if (args.auto) {
    launchSession(args.auto, made, call);
  }

  if (args.focus) {
    // The arrangement is where the final song lives, so it wins whatever order
    // the call named them in.
    const last =
      made.findLast(({ payload }) => payload.ref.view === "arrangement") ??
      made.at(-1);

    if (last != null) {
      focusSelect({ id: last.entry.id, detailView: "clip" });
    }
  }
}

// --- Helpers below main export ---

/**
 * The clips the call made and still has: an entry that names none (a skip, one
 * named again, one a later write cleared) is not one.
 * @param done - What the call did
 * @returns The clips, in the order the call named them
 */
function madeEntries(done: CreateDone): MadeEntry[] {
  return done.targets.flatMap((target, index) => {
    const entry = done.entries[index] as Partial<ClipResultObject>;

    return target.skip == null &&
      done.outcomes[index] === "written" &&
      entry.id != null
      ? [{ payload: target.data, entry: entry as ClipResultObject, index }]
      : [];
  });
}

/**
 * Launch the session clips the call made, the way `auto` asks. Firing an empty
 * slot stops its track, so only slots that got a clip are launched, and a call
 * that made none says that `auto` did nothing.
 * @param auto - The auto action
 * @param made - The clips the call made
 * @param call - The call's shared state, for its warnings
 */
function launchSession(auto: string, made: MadeEntry[], call: Call): void {
  const slots = made.flatMap(({ payload }): ClipSlotPosition[] =>
    payload.ref.view === "session"
      ? [
          {
            trackIndex: payload.position.trackIndex,
            sceneIndex: payload.position.sceneIndex as number,
          },
        ]
      : [],
  );

  if (slots.length === 0) {
    call.ignored("auto", "it launches clip slots, and none got a clip");

    return;
  }

  try {
    launchCreatedClips(auto, slots);
  } catch (error) {
    // The clips are made; failing the call would hide them.
    call.ignored("auto", errorMessage(error));
  }
}

/**
 * Account for every arrangement clip a later write of the same call cleared or
 * cut. Most clashes are met before the write (and say so on the entry); this is
 * the one the call only found out about while writing: an audio clip's length
 * is the sample's, so nothing says up front what a later clip goes over.
 * @param run - The call's shared state
 * @param done - What the call did
 */
function reportOverwritten(run: CreateRun, done: CreateDone): void {
  reportClearedClips<ClipResultObject>({
    written: madeEntries(done)
      .filter(({ payload }) => payload.ref.view === "arrangement")
      .map(({ entry, index }) => ({
        entry,
        said: done.shortened.has(index),
      })),
    spanOf: (entry) => run.landings.landed.get(entry.id),
    log: run.landings,
    lanes: run.context.lanes,
  });
}
