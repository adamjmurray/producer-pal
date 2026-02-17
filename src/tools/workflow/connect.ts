// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
} from "#src/shared/pitch.ts";
import { VERSION } from "#src/shared/version.ts";
import { skills as basicSkills } from "#src/skills/basic.ts";
import { skills } from "#src/skills/standard.ts";

interface LiveSetInfo {
  name?: unknown;
  tempo: unknown;
  timeSignature: string | null;
  sceneCount: number;
  regularTrackCount: number;
  returnTrackCount: number;
  isPlaying?: boolean;
  scale?: string;
  scalePitches?: string;
}

interface ConnectResult {
  connected: boolean;
  producerPalVersion: string;
  abletonLiveVersion: string;
  liveSet: LiveSetInfo;
  $skills?: string;
  memoryContent?: string;
}

/**
 * Initialize connection to Ableton Live with minimal data for safety
 * @param _params - No parameters used
 * @param context - The userContext from main.js
 * @returns Connection status and basic Live Set info
 */
export function connect(
  _params: object = {},
  context: Partial<ToolContext> = {},
): ConnectResult {
  const liveSet = LiveAPI.from("live_set");
  const liveApp = LiveAPI.from("live_app");

  const trackIds = liveSet.getChildIds("tracks");
  const returnTrackIds = liveSet.getChildIds("return_tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  const abletonLiveVersion = liveApp.call("get_version_string") as string;

  // Build liveSet overview matching readLiveSet default response
  const liveSetName = liveSet.getProperty("name");

  const liveSetInfo: LiveSetInfo = {
    ...(liveSetName ? { name: liveSetName } : {}),
    tempo: liveSet.getProperty("tempo"),
    timeSignature: liveSet.timeSignature,
    sceneCount: sceneIds.length,
    regularTrackCount: trackIds.length,
    returnTrackCount: returnTrackIds.length,
  };

  const isPlaying = (liveSet.getProperty("is_playing") as number) > 0;

  if (isPlaying) {
    liveSetInfo.isPlaying = true;
  }

  const scaleMode = liveSet.getProperty("scale_mode") as number;
  const scaleEnabled = scaleMode > 0;

  if (scaleEnabled) {
    const scaleName = liveSet.getProperty("scale_name") as string;
    const rootNote = liveSet.getProperty("root_note") as number;
    const scaleRoot = PITCH_CLASS_NAMES[rootNote];

    liveSetInfo.scale = `${scaleRoot} ${scaleName}`;

    const scaleIntervals = liveSet.getProperty("scale_intervals") as number[];

    liveSetInfo.scalePitches = intervalsToPitchClasses(
      scaleIntervals,
      rootNote,
    ).join(",");
  }

  const result: ConnectResult = {
    connected: true,
    producerPalVersion: VERSION,
    abletonLiveVersion,
    liveSet: liveSetInfo,
  };

  result.$skills = context.smallModelMode ? basicSkills : skills;

  // Include project notes if enabled
  if (context.memory?.enabled && context.memory.content) {
    result.memoryContent = context.memory.content;
  }

  return result;
}
