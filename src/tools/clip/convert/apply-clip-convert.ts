// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The `convert` param: one audio clip becomes a new track. Runs last in a
// clip's update, on the clip the rest of it settled on, so the conversion hears
// the edited clip. Only the remote script can do it, and it answers before Live
// has made anything, so the new track is found by comparing track lists.

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  CONVERT_ROUTE,
  type ConvertReply,
  type ConvertRequest,
  type ConvertType,
  MIDI_CONVERT_TYPES,
} from "#src/tools/clip/convert/remote-script-convert-contract.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  type ClipReasons,
  ignoreClipParams,
} from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import { REMOTE_SCRIPT_SETUP } from "#src/tools/shared/remote-script/remote-script-setup.ts";
import { whyUnavailable } from "#src/tools/shared/remote-script/outdated-remote-script.ts";
import { appendDetail } from "#src/tools/shared/helpers/entry-details.ts";
import {
  remoteScriptExpiry,
  remoteScriptWait,
} from "#src/tools/shared/remote-script/remote-script-wait.ts";
import { REQUEST_OUT_OF_TIME } from "#src/tools/shared/validation/lists/named-targets.ts";
import { objectPathForApi } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  convertedResult,
  findConvertedClip,
  regularTrackIds,
  type SourcePlace,
  waitForNewTracks,
} from "./find-converted-track.ts";

/**
 * The most to wait for the new track. Live blocks for about a second to convert
 * a clip, more for a long one; this leaves room for a slow one without holding
 * a call that will never finish.
 */
const ARRIVAL_WAIT_MS = 20_000;

/** The least left over for the new track to show up once Live has the job. */
const MIN_ARRIVAL_WAIT_MS = 3000;

/** Why a conversion can't run without the remote script. */
export const CONVERT_NEEDS_REMOTE_SCRIPT = `converting a clip needs the Producer Pal remote script, which isn't answering; ${REMOTE_SCRIPT_SETUP}`;

/** What the conversions of one call know of each other. */
export interface ConvertProgress {
  /** A conversion made a track, which shifts the paths of the ones after it */
  madeTrack: boolean;
  /**
   * A conversion's track wasn't found, or wasn't the only new one. A late track
   * would land in the next diff, so the rest of the call's conversions stop.
   */
  stalled: boolean;
}

/**
 * Fresh progress, for a call that hasn't converted anything.
 * @returns The progress
 */
export function newConvertProgress(): ConvertProgress {
  return { madeTrack: false, stalled: false };
}

/** Why a conversion wasn't started after an earlier one stalled. */
const AFTER_STALL =
  "not converted: an earlier conversion in this call didn't show its new track, so this one wasn't started; re-run it";

/** What one clip's conversion needs to run and to report. */
export interface ClipConvert {
  /** The clip's entry, written to */
  entry: ClipResult | undefined;
  /** The `convert` param */
  type: ConvertType | undefined;
  /** The clip's id as the call found it, which a refusal is filed under */
  clipId: string;
  reasons: ClipReasons;
  /** The call's conversions so far */
  progress: ConvertProgress;
  /** The request deadline from ToolContext, if any */
  deadline?: number | null;
}

/** The clip to convert, as the remote script names it, and where it sits. */
interface Source {
  request: Pick<ConvertRequest, "track" | "slot" | "arrangementIndex">;
  place: SourcePlace;
}

/** Why a clip somewhere the remote script can't reach isn't converted. */
const NOT_REACHABLE =
  "not converted: only a clip in a session slot or on a track's main arrangement lane can be converted";

/** Whether Live took the job. `unsure` is set when it may or may not have. */
type Started = { ok: true; unsure?: string } | { ok: false; reason: string };

/**
 * Convert one clip, and report what it made on the clip's entry.
 *
 * A conversion that couldn't start is a refusal: with nothing else asked of the
 * clip, its entry is a skip. Once Live has the job, nothing here throws: the
 * entry says what was found, and what wasn't.
 * @param convert - The clip, the kind of conversion, and where to report
 */
export async function applyClipConvert(convert: ClipConvert): Promise<void> {
  const { entry, type, clipId, reasons, progress, deadline } = convert;

  if (entry == null || type == null) {
    return;
  }

  const refuse = (why: string): void =>
    ignoreClipParams(reasons, clipId, ["convert"], why);

  if (progress.stalled) {
    refuse(AFTER_STALL);

    return;
  }

  const source = readSource(entry.id);

  if (typeof source === "string") {
    refuse(source);

    return;
  }

  const waitMs = remoteScriptWait(deadline, MIN_ARRIVAL_WAIT_MS);

  if (waitMs == null) {
    refuse(`not converted: ${REQUEST_OUT_OF_TIME}; re-run for this clip`);

    return;
  }

  const before = new Set(regularTrackIds());
  const started = await startConversion(
    { ...source.request, type, expiresInMs: remoteScriptExpiry(waitMs) },
    waitMs,
  );

  if (!started.ok) {
    refuse(started.reason);

    return;
  }

  const arrived = await waitForNewTracks(before, arrivalWait(deadline));

  progress.madeTrack ||= arrived.length > 0;
  progress.stalled = arrived.length !== 1 || started.unsure != null;

  await reportArrival(entry, arrived, {
    type,
    place: source.place,
    unsure: started.unsure,
  });
}

// --- Helpers below main export ---

/**
 * Where the clip sits and how the remote script names it, or why it can't be
 * converted.
 * @param clipId - The clip
 * @returns The source, or the reason it can't be converted
 */
function readSource(clipId: string): Source | string {
  const clip = LiveAPI.from(clipId);

  if ((clip.getProperty("is_audio_clip") as number) <= 0) {
    return "not converted: only an audio clip can be converted";
  }

  const trackIndex = clip.trackIndex;
  const arrangementIndex = /arrangement_clips (\d+)$/.exec(clip.path)?.[1];
  const slot = clip.clipSlotIndex;

  // The remote script reaches a track's own lane and its Session slots, not a
  // take lane.
  if (trackIndex == null || clip.path.includes("take_lanes")) {
    return NOT_REACHABLE;
  }

  const track = `t${String(trackIndex)}`;

  if (arrangementIndex != null) {
    return {
      request: { track, arrangementIndex: Number(arrangementIndex) },
      place: {
        kind: "arrangement",
        startTime: clip.getProperty("start_time") as number,
      },
    };
  }

  return slot == null
    ? NOT_REACHABLE
    : { request: { track, slot }, place: { kind: "session", slot } };
}

/**
 * Ask the remote script to start the conversion.
 * @param request - What to convert, and how
 * @param waitMs - How long to wait for the answer
 * @returns Whether Live took the job, or why it didn't
 */
async function startConversion(
  request: ConvertRequest,
  waitMs: number,
): Promise<Started> {
  const response = await requestNode<ConvertReply>(
    CONVERT_ROUTE,
    request,
    waitMs,
  );
  const reply = response.success ? response.result : undefined;

  // No answer says nothing of whether Live got the job.
  if (reply == null) {
    return {
      ok: true,
      unsure: "the Producer Pal remote script did not answer in time",
    };
  }

  if (!reply.available) {
    return {
      ok: false,
      reason: whyUnavailable(reply, CONVERT_NEEDS_REMOTE_SCRIPT),
    };
  }

  if (reply.error == null) {
    return { ok: true };
  }

  return reply.unfinished === true
    ? { ok: true, unsure: reply.error }
    : { ok: false, reason: `not converted: ${reply.error}` };
}

/**
 * How long to look for the new track: the usual wait, or what the request has
 * left if that's less.
 * @param deadline - The request deadline, if any
 * @returns The wait, in ms
 */
function arrivalWait(deadline: number | null | undefined): number {
  const left = deadline == null ? ARRIVAL_WAIT_MS : deadline - Date.now();

  return Math.max(0, Math.min(ARRIVAL_WAIT_MS, left));
}

/** What a started conversion is looking for. */
interface Looking {
  type: ConvertType;
  place: SourcePlace;
  /** Why Live may not have taken the job, when that isn't known */
  unsure?: string;
}

/**
 * Put what the conversion made on the entry: the new track and its clip. When
 * that can't be told, say what was seen, since Live has already changed.
 * @param entry - The clip's entry, written to
 * @param arrived - The ids of the tracks that appeared
 * @param looking - What the conversion should have made
 */
async function reportArrival(
  entry: ClipResult,
  arrived: string[],
  looking: Looking,
): Promise<void> {
  const [trackId, ...others] = arrived;

  if (trackId == null) {
    appendDetail(entry, noTrackYet(looking.unsure));

    return;
  }

  if (others.length > 0) {
    const paths = arrived.map((id) => objectPathForApi(LiveAPI.from(id)) ?? id);

    appendDetail(
      entry,
      `${String(arrived.length)} new tracks appeared (${paths.join(", ")}), so which one came from this clip is unclear`,
    );

    return;
  }

  const wantsClip = MIDI_CONVERT_TYPES.has(looking.type);
  const clip = wantsClip
    ? await findConvertedClip(trackId, looking.place)
    : null;

  entry.converted = convertedResult(trackId, clip);

  if (wantsClip && clip == null) {
    appendDetail(entry, "the new track has no MIDI clip where this clip was");
  }
}

/**
 * What to say when the conversion was sent and no track came.
 * @param unsure - Why Live may not have taken the job, if that's not known
 * @returns The detail
 */
function noTrackYet(unsure: string | undefined): string {
  const lookFirst = "look for the new track before converting again";

  return unsure == null
    ? `the conversion was started, but no new track has appeared yet; ${lookFirst}`
    : `${unsure}, and no new track has appeared: the conversion may or may not have started; ${lookFirst}`;
}
