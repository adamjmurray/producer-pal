// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { VERSION } from "#src/shared/config.ts";
import {
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
} from "#src/shared/pitch.ts";

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
}

/**
 * Initialize connection to Ableton Live with minimal data for safety. The
 * per-project context blob is no longer embedded in this result — it is
 * appended Node-side as its own labeled block (withProjectContext), the same
 * shape as the global-context and memory blocks, so V8 (no filesystem) and
 * external MCP clients all see the same consistent connect response. The
 * `nextStep` instruction moved to Node-side too (withNextStep), where it lands
 * after those blocks and can vary with what they held — V8 cannot read them.
 * @param _params - No parameters used
 * @returns Connection status and basic Live Set info
 */
export function connect(_params: object = {}): ConnectResult {
  const liveSet = LiveAPI.from("live_set");
  const liveApp = LiveAPI.from("live_app");

  const trackIds = liveSet.getChildIds("tracks");
  const returnTrackIds = liveSet.getChildIds("return_tracks");
  const sceneIds = liveSet.getChildIds("scenes");

  // Live 12.4 returns "12.4" which Max V8 coerces to a number; force string.
  const abletonLiveVersion = String(liveApp.call("get_version_string"));

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

  return {
    connected: true,
    producerPalVersion: VERSION,
    abletonLiveVersion,
    liveSet: liveSetInfo,
  };
}
