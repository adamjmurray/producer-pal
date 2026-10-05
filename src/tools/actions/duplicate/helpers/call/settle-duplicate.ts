// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { isGroupTrack } from "#src/tools/shared/arrangement/tracks/tracks-inside-group.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import { blankTargetIgnores } from "#src/tools/shared/validation/lists/target-lists.ts";
import {
  type Call,
  type Done,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import { applyTransformsToDuplicatedClips } from "../clip/apply-clip-transforms.ts";
import { reportOverwrittenCopies } from "../clip/overwrites/overwritten-copies.ts";
import {
  settleDevicePaths,
  type DeviceCopy,
} from "../device/device-copy-entry.ts";
import { focusIfRequested } from "../focus-if-requested.ts";
import { groupCopyMembersDetail } from "./group-copy-members.ts";
import {
  settleCopyPaths,
  type CopyEntry,
} from "../sources/copy-path-settling.ts";
import {
  noteUnhonoredTrackToPath,
  routeTrackCopy,
} from "../sources/duplicate-track.ts";
import {
  type CopyPayload,
  type DuplicateCall,
  type DuplicateRun,
} from "./duplicate-call-types.ts";

type DuplicateDone = Done<CopyPayload, DuplicateCall, object>;

/** A track copy's entry and the id of the track it was copied from. */
interface TrackCopy {
  entry: { id: string; detail?: string };
  sourceId: string;
}

/**
 * Once every copy has had its turn: name where each copy is now, say what a
 * later copy did to an earlier one, run what is applied to all the copies, and
 * focus the last one.
 * @param run - The call's shared state
 * @param done - What the call did
 * @param call - The call's shared state, for its warnings
 */
export async function settleDuplicate(
  run: DuplicateRun,
  done: DuplicateDone,
  call: Call,
): Promise<void> {
  const parsed = done.checked;
  const { type } = parsed;
  const copies = writtenEntries(done);

  if (parsed.laneCopy) {
    reportOverwrittenCopies(done.entries, done.shortened, run.context.lanes);
  } else if (type === "track") {
    settleTracks(copies, done);
  } else if (type === "scene" && !parsed.onArrangement) {
    settleCopyPaths(withPaths(copies), "scene");
  } else if (type === "device") {
    settleDevicePaths(copies as DeviceCopy[]);
  } else if (type === "clip" || type === "scene") {
    // A copy can land on one an earlier copy in this call just made. Say so in
    // that copy's own entry, before anything downstream spends an id that now
    // names nothing.
    reportOverwrittenCopies(done.entries, done.shortened, run.context.lanes);

    // Apply transforms/code to the duplicated clips (per-clip via update-clip)
    if (
      type === "clip" &&
      (parsed.args.transforms != null || parsed.args.code != null)
    ) {
      await applyTransformsToDuplicatedClips(
        done.entries,
        parsed.args.transforms,
        parsed.args.code,
        run.context,
      );
    }
  }

  // Said once the copies are made: they claim what the call did.
  for (const { param, why } of blankTargetIgnores(
    parsed.args,
    `${type}s`,
    done.targets.filter(({ skip }) => skip == null).length,
  )) {
    call.ignored(param, why);
  }

  focusIfRequested(parsed.args.focus, run.destination, type, done.entries);
}

// --- Helpers below main export ---

/**
 * The entries of the copies that were made.
 * @param done - What the call did
 * @returns Those entries, in the order named
 */
function writtenEntries(done: DuplicateDone): object[] {
  return done.entries.filter((_, index) => done.outcomes[index] === "written");
}

/**
 * Say where each track copy is, now that every copy exists, and feed the
 * copies into their source when asked: routing changes the source's input, so
 * it waits for the last copy to be made.
 * @param copies - The track copies' entries
 * @param done - What the call did
 */
function settleTracks(copies: object[], done: DuplicateDone): void {
  const parsed = done.checked;

  settleCopyPaths(withPaths(copies), "track");
  noteGroupMembers(done);

  if (parsed.args.routeToSource === true) {
    for (const { entry, sourceId } of writtenTrackCopies(done)) {
      routeTrackCopy(
        entry,
        LiveAPI.from(entry.id),
        LiveAPI.from(sourceId).trackIndex as number,
      );
    }
  }

  noteUnhonoredTrackToPath(copies, parsed.args.toPath);
}

/**
 * Says on each group copy's entry which tracks came with it. The copies have
 * settled, so every path listed is where the track is after the call.
 * @param done - What the call did
 */
function noteGroupMembers(done: DuplicateDone): void {
  // A source is read once, however many copies it made.
  const groupSources = new Map<string, boolean>();

  for (const { entry, sourceId } of writtenTrackCopies(done)) {
    if (!groupSources.has(sourceId)) {
      groupSources.set(sourceId, isGroupTrack(LiveAPI.from(sourceId)));
    }

    const detail = groupSources.get(sourceId)
      ? groupCopyMembersDetail(LiveAPI.from(entry.id))
      : undefined;

    if (detail != null) {
      appendDetail(entry, detail);
    }
  }
}

/**
 * The track copies that were made, with the source each was copied from.
 * @param done - What the call did
 * @returns Each copy's entry, which has an id, and its source's id
 */
function writtenTrackCopies(done: DuplicateDone): TrackCopy[] {
  return done.targets.flatMap((target, index) => {
    const entry = done.entries[index] as { id?: string; detail?: string };

    return done.outcomes[index] === "written" &&
      target.skip == null &&
      entry.id != null &&
      target.data.body.kind === "track"
      ? [
          {
            entry: entry as TrackCopy["entry"],
            sourceId: target.data.body.sourceId,
          },
        ]
      : [];
  });
}

/**
 * The copy entries that say where they landed. A copy that threw before its
 * entry was complete has nowhere to move.
 * @param copies - The entries of the copies that were made
 * @returns Those with an id and a path
 */
function withPaths(copies: object[]): CopyEntry[] {
  return copies.filter(
    (entry) => "id" in entry && "path" in entry && "clips" in entry,
  ) as CopyEntry[];
}
