// src/tools/constants.js
export const MAX_AUTO_CREATED_TRACKS = 100;
export const MAX_AUTO_CREATED_SCENES = 1000;
export const MAX_CLIP_BEATS = 1_000_000;

// State string constants (5 valid states)
export const STATE = {
  ACTIVE: "active",
  MUTED: "muted",
  MUTED_VIA_SOLO: "muted-via-solo",
  MUTED_ALSO_VIA_SOLO: "muted-also-via-solo",
  SOLOED: "soloed",
};

// Live API numeric values for device types
export const LIVE_API_DEVICE_TYPE_INSTRUMENT = 1;
export const LIVE_API_DEVICE_TYPE_AUDIO_EFFECT = 2;
export const LIVE_API_DEVICE_TYPE_MIDI_EFFECT = 4;

// Device type string constants (7 valid types)
export const DEVICE_TYPE = {
  INSTRUMENT: "instrument",
  INSTRUMENT_RACK: "instrument-rack",
  DRUM_RACK: "drum-rack",
  AUDIO_EFFECT: "audio-effect",
  AUDIO_EFFECT_RACK: "audio-effect-rack",
  MIDI_EFFECT: "midi-effect",
  MIDI_EFFECT_RACK: "midi-effect-rack",
};

// Array of all valid device types for documentation
export const DEVICE_TYPES = Object.values(DEVICE_TYPE);

// Monitoring states for user-facing API
export const MONITORING_STATE = {
  IN: "in",
  AUTO: "auto",
  OFF: "off",
};

// Live API numeric values for monitoring states
export const LIVE_API_MONITORING_STATE_IN = 0;
export const LIVE_API_MONITORING_STATE_AUTO = 1;
export const LIVE_API_MONITORING_STATE_OFF = 2;

export const VALID_SCALE_NAMES = [
  "Major",
  "Minor",
  "Dorian",
  "Mixolydian",
  "Lydian",
  "Phrygian",
  "Locrian",
  "Whole Tone",
  "Half-whole Dim.",
  "Whole-half Dim.",
  "Minor Blues",
  "Minor Pentatonic",
  "Major Pentatonic",
  "Harmonic Minor",
  "Harmonic Major",
  "Dorian #4",
  "Phrygian Dominant",
  "Melodic Minor",
  "Lydian Augmented",
  "Lydian Dominant",
  "Super Locrian",
  "8-Tone Spanish",
  "Bhairav",
  "Hungarian Minor",
  "Hirajoshi",
  "In-Sen",
  "Iwato",
  "Kumoi",
  "Pelog Selisir",
  "Pelog Tembung",
  "Messiaen 3",
  "Messiaen 4",
  "Messiaen 5",
  "Messiaen 6",
  "Messiaen 7",
];
