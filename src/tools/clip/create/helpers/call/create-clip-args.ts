// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** Every param one create-clip call carries, as the tool received them. */
export interface CreateClipArgs {
  /** Where the clip(s) go: "t0/s1" clip slot, "t0" arrangement, comma-separated */
  path?: string | null;

  /** Deprecated session clip slot(s), trackIndex/sceneIndex comma-separated */
  slot?: string | null;

  /** Hidden alias for path: track index (0-based) */
  trackIndex?: number | null;

  /** Hidden alias for path: scene index (0-based), with trackIndex */
  sceneIndex?: number | null;

  /** Song position(s), bar|beat or `loc:<locator>`, comma-separated */
  arrangementStart?: string | null;

  /** Musical notation string (MIDI clips only) */
  notes?: string | null;

  /** Transform expressions */
  transforms?: string | null;

  /** Absolute path to audio file (audio clips only) */
  sampleFile?: string | null;

  /** Base name for the clips */
  name?: string | null;

  /** Color in #RRGGBB hex format */
  color?: string | null;

  /** Time signature in format "4/4" */
  timeSignature?: string | null;

  /** Bar|beat position where loop/clip region begins */
  start?: string | null;

  /** Clip length: <count>bar, n<fraction> note value, or <count>bar+n<fraction> */
  length?: string | null;

  /** Bar|beat position for initial playback start */
  firstStart?: string | null;

  /** Enable looping for the clip */
  looping?: boolean | null;

  /** Audio clips only: warp state, or null to keep Live's own choice */
  warping?: boolean | null;

  /** Audio clip gain in decibels (-70 to 24) */
  gainDb?: number | null;

  /** Audio clip pitch shift in semitones (-48 to 48) */
  pitchShift?: number | null;

  /** Audio clip warp mode */
  warpMode?: string | null;

  /** Automatic playback action */
  auto?: string | null;

  /** Select the created clip and show clip detail view */
  focus?: boolean;

  /** JavaScript code to generate notes (MIDI clips only) */
  code?: string | null;

  /** Arrangement take lane target: 0/omitted = main lane, 1+ = that lane */
  takeLane?: number | string | null;

  /** Deprecated: name for a take lane newly created by this call */
  takeLaneName?: string | null;
}
