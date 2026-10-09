// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { returnTrackRename } from "#src/tools/track/helpers/return-track-rename.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import { landedColor } from "#src/tools/shared/helpers/landed-color.ts";
import {
  type TargetNotes,
  newTargetNotes,
  noteLanded,
  refuseIfNoneLanded,
  reportTargetNotes,
} from "#src/tools/shared/helpers/target-notes.ts";
import {
  SEND_PARAMS,
  type SendResult,
  withSupersededSends,
} from "#src/tools/shared/sends/send-list.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type AppliedTarget,
  type Step,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type PanningMode,
  type TrackMixerApplied,
  applyMixerProperties,
} from "../track-mixer-updates.ts";
import { applyMonitoringState } from "../track-monitoring-updates.ts";
import {
  type RoutingParams,
  applyRoutingProperties,
} from "../track-routing-updates.ts";
import { applyTrackSends, type TrackSends } from "../track-send-updates.ts";
import { applyTrackSwitches } from "../track-switch-updates.ts";
import {
  type UpdateTakeLaneResult,
  updateTakeLane,
} from "../track-take-lanes.ts";
import { type TrackChecked } from "./check-track-call.ts";
import { type UpdateTrackArgs } from "./parse-track-call.ts";
import { type TrackPayload } from "./resolve-track-targets.ts";

export interface UpdateTrackResult extends TrackMixerApplied {
  id: string;
  path?: string;
  /**
   * The name the track ended up with, when it isn't the one asked for. `detail`
   * says why, and there is no `ok` — the rename happened.
   */
  name?: string;
  /** The palette color Live settled on, when it isn't the one asked for */
  color?: string;
  detail?: string;
  /** Every send the call wrote, read back off the track */
  sends?: SendResult[];
}

/** One target's entry: a track's, or a take lane's. */
export type TrackEntry = UpdateTrackResult | UpdateTakeLaneResult;

/** Params that name a track rather than asking anything of it, plus the
 * deprecated routing aliases the current names already stand in for. */
const NOT_TRACK_WORK = new Set([
  "id",
  "ids",
  "path",
  "paths",
  "inputRoutingTypeId",
  "inputRoutingChannelId",
  "outputRoutingTypeId",
  "outputRoutingChannelId",
]);

/** The mixer values one track takes from the call. */
interface MixerParams {
  gainDb?: number;
  pan?: number;
  panningMode?: PanningMode;
  leftPan?: number;
  rightPan?: number;
}

/**
 * Write one target: a take lane's name, or a track's properties. Each piece is
 * reported as it lands, so a throw later in the write keeps the target's entry
 * and says what already changed.
 * @param target - The target
 * @param step - The call's state for this target
 * @returns The target's entry
 */
export function writeTrack(
  target: AppliedTarget<TrackPayload>,
  step: Step<TrackChecked>,
): TrackEntry {
  const { data } = target;

  if (data.kind === "lane") {
    const { args, parsedNames, laneIgnores } = step.checked;
    const name = getNameForIndex(args.name, step.index, parsedNames);

    return updateTakeLane(data.spec, name, laneIgnores, step.landed);
  }

  return writeTrackProperties(data.track, step);
}

// --- Helpers below main export ---

/**
 * Write every property the call asked of one track.
 * @param track - The track
 * @param step - The call's state for this target
 * @returns The track's entry
 * @throws Error when the call asked only for writes the track can't take
 */
function writeTrackProperties(
  track: LiveAPI,
  step: Step<TrackChecked>,
): UpdateTrackResult {
  const { checked, index } = step;
  const { args } = checked;
  const address = { id: track.id, ...pathField(track) };
  const notes = newTargetNotes((phrase) => step.landed(phrase, address));
  const name = getNameForIndex(args.name, index, checked.parsedNames);
  const color = getColorForIndex(args.color, index, checked.parsedColors);
  const rename = returnTrackRename(track.path, name);

  track.setAll({ name: rename.write, color }, (property) =>
    noteLanded(notes, property),
  );
  applyTrackSwitches(
    track,
    { mute: args.mute, solo: args.solo, arm: args.arm },
    notes,
  );

  const colorLanded = color == null ? {} : landedColor(track, color);
  const mixer = trackMixer(track, args, notes);
  const routing = checked.routingAt(index);

  applyRoutingProperties(track, routing, notes);
  applyMonitoringState(track, args.monitoringState, notes);

  const sends = writeSends(track, checked.sendsAt(index), notes);

  // Optimistic except for the color, mixer and sends, read back off the
  // track. Each of those can have its own say, so the details are joined
  // rather than spread over one another.
  const detail = joinDetails([
    rename.landed.detail,
    colorLanded.detail,
    mixer.detail,
  ]);

  const result: UpdateTrackResult = {
    ...address,
    ...rename.landed,
    ...colorLanded,
    ...mixer,
    ...(detail == null ? {} : { detail }),
    ...(sends.length > 0 ? { sends } : {}),
  };

  return reportTargetNotes(
    result,
    notes,
    trackWorkAsked(args, name, color, routing),
  );
}

/**
 * Write a track's mixer, when the call asked for any of it.
 * @param track - Track object
 * @param args - The call's args; only its mixer values are read
 * @param notes - What the track's entry has to say, added to
 * @returns What the write landed, read back; empty when none was asked for
 */
function trackMixer(
  track: LiveAPI,
  args: MixerParams,
  notes: TargetNotes,
): TrackMixerApplied {
  const { gainDb, pan, panningMode, leftPan, rightPan } = args;
  const params: MixerParams = { gainDb, pan, panningMode, leftPan, rightPan };

  return Object.values(params).some((value) => value != null)
    ? applyMixerProperties(track, params, notes)
    : {};
}

/**
 * Write a track's sends, and say which ones the entry has something to report
 * about.
 * @param track - Track object
 * @param resolved - The sends this track takes, matched to return tracks
 * @param notes - What the track's entry has to say, added to
 * @returns The sends to report: one that took the level asked for has nothing
 *   to say, so only the rest report, then the ones that named no return track
 */
function writeSends(
  track: LiveAPI,
  resolved: TrackSends,
  notes: TargetNotes,
): SendResult[] {
  const landed = applyTrackSends(track, resolved.winners, (phrase) =>
    noteLanded(notes, phrase),
  );
  const entries = withSupersededSends(landed, resolved.collisions);

  refuseIfNoneLanded(
    notes,
    SEND_PARAMS,
    "send",
    [...landed.values(), ...resolved.unresolved],
    (send) => send.return,
  );

  return [
    ...entries.filter((send) => send.detail != null),
    ...resolved.unresolved,
  ];
}

/**
 * What the call asked of one track. The addressing params and the deprecated
 * routing aliases are left out: only work decides whether a refusal leaves the
 * track with nothing, and an alias would count its own refused param twice.
 * @param args - The call's parameters
 * @param name - The name this target takes from the list
 * @param color - The color this target takes from the list
 * @param routing - The routing values, under their current param names
 * @returns The work asked, keyed by param name
 */
function trackWorkAsked(
  args: UpdateTrackArgs,
  name: string | undefined,
  color: string | undefined,
  routing: RoutingParams,
): object {
  const work = Object.entries(args).filter(([key]) => !NOT_TRACK_WORK.has(key));

  return { ...Object.fromEntries(work), name, color, ...routing };
}
