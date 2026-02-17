// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
} from "#src/shared/pitch.ts";
import { VERSION } from "#src/shared/version.ts";
import {
  skills as basicSkills,
  buildInstructions as buildBasicInstruction,
} from "#src/skills/basic.ts";
import { buildInstructions, skills } from "#src/skills/standard.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";

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
  $instructions?: string;
  messagesForUser?: string;
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

  // Get basic info - minimal data for safety
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

  const messages = [
    `Producer Pal ${VERSION} connected to Ableton Live ${abletonLiveVersion}`,
    "Tell me if you rearrange things so I stay in sync.",
    "Save often! I make mistakes.",
    // additional tips set based on the state of the Live Set
  ];

  if (!hasAnyInstrument(trackIds)) {
    messages.push(`No instruments found.
To create music with MIDI clips, you need instruments (Wavetable, Operator, Drum Rack, etc).
Ask me to add an instrument, or add one yourself and I can compose MIDI patterns.`);
  }

  if (context.smallModelMode) {
    result.$skills = basicSkills;
    result.$instructions = buildBasicInstruction(context);
  } else {
    result.$skills = skills;
    result.$instructions = buildInstructions(context);
  }

  // Format as markdown bullet list
  result.messagesForUser = messages.map((msg) => `* ${msg}`).join("\n");

  // Include project notes if enabled
  if (context.memory?.enabled && context.memory.content) {
    result.memoryContent = context.memory.content;
  }

  return result;
}

/**
 * Check if any track has an instrument device
 * @param trackIds - Array of track IDs to check
 * @returns true if any MIDI track has an instrument
 */
function hasAnyInstrument(trackIds: string[]): boolean {
  for (const trackId of trackIds) {
    const track = LiveAPI.from(trackId);

    if ((track.getProperty("has_midi_input") as number) > 0) {
      for (const device of track.getChildren("devices")) {
        if (device.getProperty("type") === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
          return true;
        }
      }
    }
  }

  return false;
}
