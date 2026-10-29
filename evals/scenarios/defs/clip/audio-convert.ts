// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenarios: `ppal-update-clip` `convert` turns an audio clip into a MIDI clip
 * on a new track. It needs the remote script, so the model must find the param
 * from the request alone. Where Live puts the new track varies, so no check
 * assumes a position.
 */

import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "./helpers/clip-tool-constants.ts";
import { convertedTrackPath } from "./helpers/converted-track.ts";
import { seedAudioClip } from "./helpers/seed-audio-clip.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

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

// The tracks of a read-live-set result.
function tracksOf(result: unknown): TrackOverview[] {
  return (result as { tracks?: TrackOverview[] }).tracks ?? [];
}

// Whether the Set holds exactly one track more than the seeded Set.
function addedOneTrack(result: unknown): boolean {
  return tracksOf(result).length === SEEDED_TRACKS + 1;
}

// "name (instrument)" per track, for a failure message.
function describeTracks(result: unknown): string {
  return tracksOf(result)
    .map(
      (track) =>
        `${track.name ?? "?"} (${track.instrument ?? "no instrument"})`,
    )
    .join(", ");
}

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
      tool: TOOLS.readLiveSet,
      args: { include: ["tracks"] },
      expect: addedOneTrack,
      explain: (result) =>
        `expected one new track, tracks are: ${describeTracks(result)}`,
    },

    // The new track is a MIDI one with a clip in it. Live may detect no notes,
    // which is still an answer, so the clip's notes aren't graded.
    {
      type: "state",
      tool: TOOLS.readTrack,
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
