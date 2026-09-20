// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type TargetNotes,
  newTargetNotes,
  refuseTargetWork,
  reportTargetNotes,
} from "#src/tools/shared/helpers/target-notes.ts";
import {
  LIVE_API_MONITORING_STATE_AUTO,
  LIVE_API_MONITORING_STATE_IN,
  LIVE_API_MONITORING_STATE_OFF,
  MONITORING_STATE,
} from "#src/tools/constants.ts";
import { returnTrackRename } from "../helpers/return-track-rename.ts";
import {
  type PanningMode,
  type TrackMixerApplied,
  applyMixerProperties,
} from "./helpers/track-mixer-updates.ts";
import {
  type RoutingParams,
  applyRoutingProperties,
} from "./helpers/track-routing-updates.ts";
import {
  paramsTakeLanesIgnore,
  planTakeLaneTargets,
  updateTakeLane,
  type UpdateTakeLaneResult,
} from "./helpers/track-take-lanes.ts";
import {
  applyTrackSends,
  resolveTrackSends,
} from "./helpers/track-send-updates.ts";
import { joinReasons } from "#src/tools/shared/helpers/entry-reasons.ts";
import { landedColor } from "#src/tools/shared/helpers/landed-color.ts";
import {
  type SendResult,
  warnSendCollisions,
} from "#src/tools/shared/sends/send-list.ts";
import { type SendEntry } from "#src/tools/shared/sends/sends-schema.ts";
import { validateSendPair } from "#src/tools/shared/helpers/send-validation.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { resolveLabeledTargets } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import {
  targetObject,
  writeFanOut,
  type WriteResult,
} from "#src/tools/shared/validation/lists/write-fan-out.ts";
import { trackIdAtPath } from "#src/tools/shared/validation/path-target-lookup.ts";

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

interface UpdateTrackArgs {
  id?: string;
  /** Hidden alias for id */
  ids?: string;
  path?: string;
  /** Hidden alias for path */
  paths?: string;
  name?: string;
  color?: string;
  gainDb?: number;
  pan?: number;
  panningMode?: PanningMode;
  leftPan?: number;
  rightPan?: number;
  mute?: boolean;
  solo?: boolean;
  arm?: boolean;
  inputRoutingType?: string;
  inputRoutingChannel?: string;
  outputRoutingType?: string;
  outputRoutingChannel?: string;
  /** Deprecated: use inputRoutingType */
  inputRoutingTypeId?: string;
  /** Deprecated: use inputRoutingChannel */
  inputRoutingChannelId?: string;
  /** Deprecated: use outputRoutingType */
  outputRoutingTypeId?: string;
  /** Deprecated: use outputRoutingChannel */
  outputRoutingChannelId?: string;
  monitoringState?: string;
  sendGainDb?: number;
  sendReturn?: string;
  sends?: SendEntry[];
}

interface UpdateTrackResult extends TrackMixerApplied {
  id: string;
  path?: string;
  /**
   * The name the track ended up with, when it isn't the one asked for. `reason`
   * says why, and there is no `ok` — the rename happened.
   */
  name?: string;
  /** The palette color Live settled on, when it isn't the one asked for */
  color?: string;
  reason?: string;
  /** Every send the call wrote, read back off the track */
  sends?: SendResult[];
}

/**
 * Apply monitoring state to a track. Monitoring exists only on armable tracks,
 * so it is refused on non-armable tracks (return/master) — mirroring the
 * read-side `canBeArmed` guard in track-routing.ts.
 * @param track - Track object
 * @param monitoringState - Monitoring state value (in, auto, off)
 * @param notes - What the track's entry has to say, added to
 */
function applyMonitoringState(
  track: LiveAPI,
  monitoringState: string | undefined,
  notes: TargetNotes,
): void {
  if (monitoringState == null) {
    return;
  }

  const canBeArmed = (track.getProperty("can_be_armed") as number) > 0;

  if (!canBeArmed) {
    refuseTargetWork(
      notes,
      ["monitoringState"],
      "monitoringState is only available on armable tracks",
    );

    return;
  }

  const monitoringValue: number | undefined = {
    [MONITORING_STATE.IN]: LIVE_API_MONITORING_STATE_IN,
    [MONITORING_STATE.AUTO]: LIVE_API_MONITORING_STATE_AUTO,
    [MONITORING_STATE.OFF]: LIVE_API_MONITORING_STATE_OFF,
  }[monitoringState];

  if (monitoringValue == null) {
    console.warn(
      `invalid monitoring state "${monitoringState}". Must be one of: ${Object.values(MONITORING_STATE).join(", ")}`,
    );

    return;
  }

  track.set("current_monitoring_state", monitoringValue);
}

/**
 * Updates properties of existing tracks, and the take lanes on them
 * @param args - The track parameters
 * @param args.id - Track ID or comma-separated list of track IDs to update
 * @param args.ids - Hidden alias for id
 * @param args.path - Track or take lane path(s) to update instead of ids, comma-separated
 * @param args.paths - Hidden alias for path
 * @param args.name - Optional track name
 * @param args.color - Optional track color (CSS format: hex)
 * @param args.gainDb - Optional track gain in dB (-70 to 6)
 * @param args.pan - Optional pan position in stereo mode (-1 to 1)
 * @param args.panningMode - Optional panning mode ('stereo' or 'split')
 * @param args.leftPan - Optional left channel pan in split mode (-1 to 1)
 * @param args.rightPan - Optional right channel pan in split mode (-1 to 1)
 * @param args.mute - Optional mute state
 * @param args.solo - Optional solo state
 * @param args.arm - Optional arm state
 * @param args.inputRoutingType - Optional input routing type name or identifier
 * @param args.inputRoutingChannel - Optional input routing channel name or identifier
 * @param args.outputRoutingType - Optional output routing type name or identifier
 * @param args.outputRoutingChannel - Optional output routing channel name or identifier
 * @param args.inputRoutingTypeId - Deprecated alias for inputRoutingType
 * @param args.inputRoutingChannelId - Deprecated alias for inputRoutingChannel
 * @param args.outputRoutingTypeId - Deprecated alias for outputRoutingType
 * @param args.outputRoutingChannelId - Deprecated alias for outputRoutingChannel
 * @param args.monitoringState - Optional monitoring state ('in', 'auto', 'off')
 * @param args.sendGainDb - Optional send gain in dB (-70 to 0), requires sendReturn
 * @param args.sendReturn - Optional return track id, name, or letter prefix, requires sendGainDb
 * @param args.sends - Optional [{return, gainDb}] list, to set several at once
 * @param _context - Internal context object (unused)
 * @returns The target when one was named, otherwise one entry per target
 */
export function updateTrack(
  args: UpdateTrackArgs,
  _context: Partial<ToolContext> = {},
): WriteResult<UpdateTrackResult | UpdateTakeLaneResult> {
  const {
    id,
    ids,
    path,
    paths,
    name,
    color,
    gainDb,
    pan,
    panningMode,
    leftPan,
    rightPan,
    mute,
    solo,
    arm,
    inputRoutingType,
    inputRoutingChannel,
    outputRoutingType,
    outputRoutingChannel,
    inputRoutingTypeId,
    inputRoutingChannelId,
    outputRoutingTypeId,
    outputRoutingChannelId,
    monitoringState,
    sendGainDb,
    sendReturn,
    sends,
  } = args;
  const { targets, parsedNames, parsedColors } = resolveLabeledTargets({
    noun: "track",
    targets: { id, ids, path, paths },
    name,
    color,
  });

  validateSendPair(sendGainDb, sendReturn);

  // Lanes are planned before anything runs: a plan over the cap is refused
  // whole, because a lane an earlier entry created can't be taken back.
  const laneTargets = planTakeLaneTargets(targets);
  const laneIgnores = laneTargets.size === 0 ? [] : paramsTakeLanesIgnore(args);

  // Resolved once: the return tracks belong to the Live Set, so a per-track
  // lookup would repeat one warning down the list.
  const resolvedSends = resolveTrackSends(sendGainDb, sendReturn, sends);

  // The collisions belong to the call, not to a track, so they are announced
  // once — off the first track a collision actually landed on.
  let announcedCollisions = false;

  return writeFanOut(targets, (target, i) => {
    const trackName = getNameForIndex(name, i, parsedNames);
    const lane = laneTargets.get(i);

    if (lane != null) {
      return updateTakeLane(lane, trackName, laneIgnores);
    }

    const track = targetObject(target, "track", trackIdAtPath);
    const trackColor = getColorForIndex(color, i, parsedColors);
    const notes = newTargetNotes();

    const rename = returnTrackRename(track.path, trackName);

    track.setAll({
      name: rename.write,
      color: trackColor,
      mute,
      solo,
      arm,
    });

    const colorLanded =
      trackColor == null ? {} : landedColor(track, trackColor);

    const mixer = trackMixer(track, {
      gainDb,
      pan,
      panningMode,
      leftPan,
      rightPan,
    });

    // Handle routing properties
    const routing = {
      inputRoutingType: inputRoutingType ?? inputRoutingTypeId,
      inputRoutingChannel: inputRoutingChannel ?? inputRoutingChannelId,
      outputRoutingType: outputRoutingType ?? outputRoutingTypeId,
      outputRoutingChannel: outputRoutingChannel ?? outputRoutingChannelId,
    };

    applyRoutingProperties(track, routing, notes);

    // Handle monitoring state
    applyMonitoringState(track, monitoringState, notes);

    const landed = applyTrackSends(track, resolvedSends.winners);

    if (!announcedCollisions) {
      announcedCollisions = warnSendCollisions(
        resolvedSends.collisions,
        landed,
      );
    }

    // A send that took the level asked for has nothing to say — the caller
    // named the return and knows the level — so only the rest report.
    const changedSends = [...landed.values()].filter(
      (send) => send.reason != null,
    );

    // Optimistic except for the color, mixer and sends, read back off the
    // track. Each of those can have its own say, so the reasons are joined
    // rather than spread over one another.
    const reason = joinReasons([
      rename.landed.reason,
      colorLanded.reason,
      mixer.reason,
    ]);

    const result: UpdateTrackResult = {
      id: track.id,
      ...pathField(track),
      ...rename.landed,
      ...colorLanded,
      ...mixer,
      ...(reason == null ? {} : { reason }),
      ...(changedSends.length > 0 ? { sends: changedSends } : {}),
    };

    return reportTargetNotes(
      result,
      notes,
      trackWorkAsked(args, trackName, trackColor, routing),
    );
  });
}

/**
 * Write a track's mixer, when the call asked for any of it.
 * @param track - Track object
 * @param params - The mixer values, as the call sent them
 * @returns What the write landed, read back; empty when none was asked for
 */
function trackMixer(track: LiveAPI, params: MixerParams): TrackMixerApplied {
  return Object.values(params).some((value) => value != null)
    ? applyMixerProperties(track, params)
    : {};
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
