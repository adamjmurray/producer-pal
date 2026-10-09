// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenarios: turn an audio clip into a new track.
 *
 * `ppal-update-clip` `convert` makes a new track from an audio clip (a MIDI
 * clip of the notes Live detects, or a Simpler or Drum Rack playing it), and
 * needs the remote script. The model has to find that param from the request
 * alone, since nothing else can do it.
 *
 * `setup` puts an audio clip on a new audio track, so the Set holds one. Graded
 * on the Set: one track more than the seeded Set has, with the asked-for
 * instrument or clip. Where Live puts the new track varies, so neither check
 * assumes a position, and neither names the tool route.
 */

import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-tool-constants.ts";
import { convertedTrackPath } from "./helpers/converted-track.ts";
import { seedAudioClip } from "./helpers/seed-audio-clip.ts";

/** basic-midi-4-track has five tracks, and the seed adds an audio one. */
const SEEDED_TRACKS = 6;

/** A track in a read-live-set result. */
interface TrackOverview {
  name?: string;
  instrument?: string;
}

/** The part of a read-track result these scenarios grade. */
interface TrackRead {
  type?: string;
  sessionClips?: unknown[];
}

/**
 * The tracks of a read-live-set result.
 *
 * @param result - Parsed ppal-read-live-set result
 * @returns The track overviews, empty when there are none
 */
function tracksOf(result: unknown): TrackOverview[] {
  return (result as { tracks?: TrackOverview[] }).tracks ?? [];
}

/**
 * Whether the Set holds exactly one track more than the seeded Set.
 *
 * @param result - Parsed ppal-read-live-set result
 * @returns True when one track was added, not zero or several
 */
function addedOneTrack(result: unknown): boolean {
  return tracksOf(result).length === SEEDED_TRACKS + 1;
}

/**
 * Describe the Set's tracks for a failure message.
 *
 * @param result - Parsed ppal-read-live-set result
 * @returns "name (instrument)" per track
 */
function describeTracks(result: unknown): string {
  return tracksOf(result)
    .map(
      (track) =>
        `${track.name ?? "?"} (${track.instrument ?? "no instrument"})`,
    )
    .join(", ");
}

export const audioConvertDrumRack: EvalScenario = {
  id: "audio-convert-drum-rack",
  tags: ["clips", "devices"],
  description: "Turn an audio clip into a Drum Rack on a new track",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  judgeAdvisory: true,
  requires: {
    tools: [TOOL_UPDATE_CLIP],
    params: ["convert"],
  },

  setup: (mcpClient) => seedAudioClip(mcpClient, "Kick", "drums/kick.aiff"),

  messages: [
    MSG_CONNECT,
    "Turn the audio clip on the Kick track into a Drum Rack on a new track.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // The Set's own drum kit sits inside an Instrument Rack, so it reads as
    // that, not as "Drum Rack": only the new track reads as a bare Drum Rack.
    {
      type: "state",
      tool: "ppal-read-live-set",
      args: { include: ["tracks"] },
      expect: (result) =>
        addedOneTrack(result) &&
        tracksOf(result).filter((track) => track.instrument === "Drum Rack")
          .length === 1,
      explain: (result) =>
        `expected one new track and exactly one with a Drum Rack, tracks are: ${describeTracks(result)}`,
    },

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for the audio clip on the Kick track to be turned into a Drum
Rack on a new track. Evaluate the final reply: it says a new track with a Drum
Rack playing that clip was made, and does not claim to have changed anything
else.`,
    },
  ],
};

export const audioConvertToMidi: EvalScenario = {
  id: "audio-convert-to-midi",
  tags: ["clips"],
  description: "Turn an audio clip into a MIDI clip on a new track",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  judgeAdvisory: true,
  requires: {
    tools: [TOOL_UPDATE_CLIP],
    params: ["convert"],
  },

  setup: (mcpClient) =>
    seedAudioClip(mcpClient, "Melody Sample", "sample.aiff"),

  messages: [
    MSG_CONNECT,
    "Turn the audio clip on the Melody Sample track into MIDI notes on a new track.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    {
      type: "state",
      tool: "ppal-read-live-set",
      args: { include: ["tracks"] },
      expect: addedOneTrack,
      explain: (result) =>
        `expected one new track, tracks are: ${describeTracks(result)}`,
    },

    // The new track is a MIDI one with a clip in it. Live may detect no notes,
    // which is still an answer, so the clip's notes aren't graded.
    {
      type: "state",
      tool: "ppal-read-track",
      args: (turns) => ({
        path: convertedTrackPath(turns),
        include: ["session-clips"],
      }),
      expect: (result) => {
        const track = result as TrackRead;

        return track.type === "midi" && (track.sessionClips?.length ?? 0) > 0;
      },
      explain: (result) => {
        const track = result as TrackRead;

        return `expected a MIDI track holding a clip, got ${track.type ?? "no"} type and ${track.sessionClips?.length ?? 0} clips`;
      },
    },

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for the audio clip on the Melody Sample track to be turned into
MIDI notes on a new track. Evaluate the final reply: it says a new MIDI track
with a clip of the notes Live detected was made, and if Live found no notes it
says so rather than claiming notes. It does not claim to have changed anything
else.`,
    },
  ],
};
