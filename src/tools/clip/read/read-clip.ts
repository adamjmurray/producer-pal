import { formatNotation } from "#src/notation/barbeat/barbeat-format-notation.ts";
import {
  abletonBeatsToBarBeat,
  abletonBeatsToBarBeatDuration,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { liveGainToDb } from "#src/tools/shared/gain-utils.ts";
import {
  parseIncludeArray,
  READ_CLIP_DEFAULTS,
} from "#src/tools/shared/tool-framework/include-params.ts";
import {
  processWarpMarkers,
  resolveClip,
  WARP_MODE_MAPPING,
} from "./helpers/read-clip-helpers.ts";

interface ReadClipArgs {
  trackIndex?: number | null;
  sceneIndex?: number | null;
  clipId?: string | null;
  include?: string[];
  includeClipNotes?: boolean;
}

interface WarpMarker {
  sampleTime: number;
  beatTime: number;
}

/** Result returned by readClip */
export interface ReadClipResult {
  // Core properties
  id: string | null;
  type: "midi" | "audio" | null;
  name?: string | null;
  view?: "arrangement" | "session";
  color?: string | null;
  timeSignature?: string | null;
  looping?: boolean;
  start?: string;
  end?: string;
  length?: string;
  firstStart?: string;

  // Boolean state properties (only present when true)
  playing?: boolean;
  triggered?: boolean;
  recording?: boolean;
  overdubbing?: boolean;
  muted?: boolean;

  // Location properties
  trackIndex?: number | null;
  sceneIndex?: number | null;
  arrangementStart?: string;
  arrangementLength?: string;

  // MIDI clip properties
  noteCount?: number;
  notes?: string;

  // Audio clip properties
  gainDb?: number;
  sampleFile?: string;
  pitchShift?: number;
  sampleLength?: number;
  sampleRate?: number;
  warping?: boolean;
  warpMode?: string;
  warpMarkers?: WarpMarker[];
}

/**
 * Read a MIDI or audio clip from Ableton Live
 * @param args - Arguments for the function
 * @param args.trackIndex - Track index (0-based)
 * @param args.sceneIndex - Clip slot index (0-based)
 * @param args.clipId - Clip ID to directly access any clip
 * @param args.include - Array of data to include in response
 * @param args.includeClipNotes - Whether to include notes data (legacy parameter)
 * @param _context - Context object (unused)
 * @returns Result object with clip information
 */
export function readClip(
  args: ReadClipArgs = {},
  _context: Partial<ToolContext> = {},
): ReadClipResult {
  const { trackIndex = null, sceneIndex = null, clipId = null } = args;

  const { includeClipNotes, includeColor, includeWarpMarkers } =
    parseIncludeArray(args.include, READ_CLIP_DEFAULTS);

  if (clipId === null && (trackIndex === null || sceneIndex === null)) {
    throw new Error(
      "Either clipId or both trackIndex and sceneIndex must be provided",
    );
  }

  // Resolve clip from ID or location
  const resolved = resolveClip(clipId, trackIndex, sceneIndex);

  if (!resolved.found) {
    return resolved.emptySlotResponse;
  }

  const clip = resolved.clip;

  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;
  const timeSigNumerator = clip.getProperty("signature_numerator") as number;
  const timeSigDenominator = clip.getProperty(
    "signature_denominator",
  ) as number;

  const isLooping = (clip.getProperty("looping") as number) > 0;
  const isMidiClip = (clip.getProperty("is_midi_clip") as number) > 0;
  const lengthBeats = clip.getProperty("length") as number; // Live API already gives us the effective length!

  const clipName = clip.getProperty("name") as string;

  // Read boundary properties from Live
  const startMarkerBeats = clip.getProperty("start_marker") as number;
  const loopStartBeats = clip.getProperty("loop_start") as number;
  const loopEndBeats = clip.getProperty("loop_end") as number;
  const endMarkerBeats = clip.getProperty("end_marker") as number;

  // Calculate start and end based on looping state
  const { startBeats, endBeats } = getActiveClipBounds(
    isLooping,
    isMidiClip,
    startMarkerBeats,
    loopStartBeats,
    endMarkerBeats,
    loopEndBeats,
    lengthBeats,
  );

  // Convert to bar|beat notation
  const start = abletonBeatsToBarBeat(
    startBeats,
    timeSigNumerator,
    timeSigDenominator,
  );
  const end = abletonBeatsToBarBeat(
    endBeats,
    timeSigNumerator,
    timeSigDenominator,
  );
  const length = abletonBeatsToBarBeatDuration(
    endBeats - startBeats,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Check if firstStart differs from start
  const firstStart =
    Math.abs(startMarkerBeats - startBeats) > 0.001
      ? abletonBeatsToBarBeat(
          startMarkerBeats,
          timeSigNumerator,
          timeSigDenominator,
        )
      : null;

  const result: ReadClipResult = {
    id: clip.id,
    type: isMidiClip ? "midi" : "audio",
    ...(clipName && { name: clipName }),
    view: isArrangementClip ? "arrangement" : "session",
    ...(includeColor && { color: clip.getColor() }),
    timeSignature: clip.timeSignature,
    looping: isLooping,
    start: start,
    end: end,
    length: length,
    ...(firstStart != null && { firstStart }),
  };

  // Add boolean state properties
  addBooleanStateProperties(result, clip);

  // Add location properties
  addClipLocationProperties(result, clip, isArrangementClip);

  // Process MIDI clip properties
  if (result.type === "midi") {
    processMidiClip(
      result,
      clip,
      includeClipNotes,
      lengthBeats,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  // Process audio clip properties
  if (result.type === "audio") {
    processAudioClip(result, clip, includeWarpMarkers);
  }

  return result;
}

/**
 * Add boolean state properties (playing, triggered, recording, overdubbing, muted)
 * Only includes properties that are true
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 */
function addBooleanStateProperties(
  result: ReadClipResult,
  clip: LiveAPI,
): void {
  if ((clip.getProperty("is_playing") as number) > 0) {
    result.playing = true;
  }

  if ((clip.getProperty("is_triggered") as number) > 0) {
    result.triggered = true;
  }

  if ((clip.getProperty("is_recording") as number) > 0) {
    result.recording = true;
  }

  if ((clip.getProperty("is_overdubbing") as number) > 0) {
    result.overdubbing = true;
  }

  if ((clip.getProperty("muted") as number) > 0) {
    result.muted = true;
  }
}

/**
 * Process MIDI clip specific properties
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 * @param includeClipNotes - Whether to include formatted notes
 * @param lengthBeats - Clip length in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 */
function processMidiClip(
  result: ReadClipResult,
  clip: LiveAPI,
  includeClipNotes: boolean,
  lengthBeats: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): void {
  const notesDictionary = clip.call(
    "get_notes_extended",
    0,
    128,
    0,
    lengthBeats,
  ) as string;
  const notes = JSON.parse(notesDictionary).notes;

  result.noteCount = notes.length;

  if (includeClipNotes) {
    result.notes = formatNotation(notes, {
      timeSigNumerator,
      timeSigDenominator,
    });
  }
}

/**
 * Process audio clip specific properties
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 * @param includeWarpMarkers - Whether to include warp markers
 */
function processAudioClip(
  result: ReadClipResult,
  clip: LiveAPI,
  includeWarpMarkers: boolean,
): void {
  const liveGain = clip.getProperty("gain") as number;

  result.gainDb = liveGainToDb(liveGain);

  const filePath = clip.getProperty("file_path") as string | null;

  if (filePath) {
    result.sampleFile = filePath;
  }

  const pitchCoarse = clip.getProperty("pitch_coarse") as number;
  const pitchFine = clip.getProperty("pitch_fine") as number;

  result.pitchShift = pitchCoarse + pitchFine / 100;

  result.sampleLength = clip.getProperty("sample_length") as number;
  result.sampleRate = clip.getProperty("sample_rate") as number;

  // Warping state
  result.warping = (clip.getProperty("warping") as number) > 0;
  const warpModeValue = clip.getProperty("warp_mode") as number;

  result.warpMode = WARP_MODE_MAPPING[warpModeValue] ?? "unknown";

  // Add warp markers array when requested
  if (includeWarpMarkers) {
    const warpMarkers = processWarpMarkers(clip);

    if (warpMarkers !== undefined) {
      result.warpMarkers = warpMarkers;
    }
  }
}

/**
 * Add clip location properties (trackIndex, sceneIndex, or arrangement properties)
 * @param result - Result object to add properties to
 * @param clip - LiveAPI clip object
 * @param isArrangementClip - Whether clip is in arrangement view
 */
function addClipLocationProperties(
  result: ReadClipResult,
  clip: LiveAPI,
  isArrangementClip: boolean,
): void {
  if (isArrangementClip) {
    const liveSet = LiveAPI.from("live_set");
    const songTimeSigNumerator = liveSet.getProperty(
      "signature_numerator",
    ) as number;
    const songTimeSigDenominator = liveSet.getProperty(
      "signature_denominator",
    ) as number;

    result.trackIndex = clip.trackIndex;
    const startTimeBeats = clip.getProperty("start_time") as number;
    const endTimeBeats = clip.getProperty("end_time") as number;

    result.arrangementStart = abletonBeatsToBarBeat(
      startTimeBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
    result.arrangementLength = abletonBeatsToBarBeatDuration(
      endTimeBeats - startTimeBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
  } else {
    result.trackIndex = clip.trackIndex;
    result.sceneIndex = clip.sceneIndex;
  }
}

/**
 * Get the active start and end beats based on looping state
 * @param isLooping - Whether the clip is looping
 * @param isMidiClip - Whether the clip is a MIDI clip (vs audio)
 * @param startMarkerBeats - Start marker position in beats
 * @param loopStartBeats - Loop start position in beats
 * @param endMarkerBeats - End marker position in beats
 * @param loopEndBeats - Loop end position in beats
 * @param lengthBeats - Clip length in beats
 * @returns Object with startBeats and endBeats
 */
function getActiveClipBounds(
  isLooping: boolean,
  isMidiClip: boolean,
  startMarkerBeats: number,
  loopStartBeats: number,
  endMarkerBeats: number,
  loopEndBeats: number,
  lengthBeats: number,
): { startBeats: number; endBeats: number } {
  const startBeats = isLooping ? loopStartBeats : startMarkerBeats;
  const endBeats = isLooping ? loopEndBeats : endMarkerBeats;

  // Sanity check for non-looping MIDI clips only
  // (audio clips have length based on sample duration, not end_marker - start_marker)
  if (!isLooping && isMidiClip) {
    const derivedStart = endBeats - lengthBeats;

    if (Math.abs(derivedStart - startBeats) > 0.001) {
      console.error(
        `Warning: Derived start (${derivedStart}) differs from start_marker (${startBeats})`,
      );
    }
  }

  return { startBeats, endBeats };
}
