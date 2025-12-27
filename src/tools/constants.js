export const MAX_AUTO_CREATED_TRACKS = 100;
export const MAX_AUTO_CREATED_SCENES = 1000;
export const MAX_CLIP_BEATS = 1_000_000;
export const MAX_ARRANGEMENT_POSITION_BEATS = 1_576_800;
export const MAX_SLICES = 64;

// State string constants (6 valid states)
export const STATE = {
  ACTIVE: "active",
  MUTED: "muted",
  MUTED_VIA_SOLO: "muted-via-solo",
  MUTED_ALSO_VIA_SOLO: "muted-also-via-solo",
  MUTED_AND_SOLOED: "muted-and-soloed",
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

// Warp modes for user-facing API
export const WARP_MODE = {
  BEATS: "beats",
  TONES: "tones",
  TEXTURE: "texture",
  REPITCH: "repitch",
  COMPLEX: "complex",
  REX: "rex",
  PRO: "pro",
};

// Live API numeric values for warp modes
export const LIVE_API_WARP_MODE_BEATS = 0;
export const LIVE_API_WARP_MODE_TONES = 1;
export const LIVE_API_WARP_MODE_TEXTURE = 2;
export const LIVE_API_WARP_MODE_REPITCH = 3;
export const LIVE_API_WARP_MODE_COMPLEX = 4;
export const LIVE_API_WARP_MODE_REX = 5;
export const LIVE_API_WARP_MODE_PRO = 6;

// Live API numeric values for focused_document_view
export const LIVE_API_VIEW_SESSION = 1;
export const LIVE_API_VIEW_ARRANGEMENT = 2;

// Live API view names from available_main_views
export const LIVE_API_VIEW_NAMES = {
  BROWSER: "Browser",
  ARRANGER: "Arranger",
  SESSION: "Session",
  DETAIL: "Detail",
  DETAIL_CLIP: "Detail/Clip",
  DETAIL_DEVICE_CHAIN: "Detail/DeviceChain",
};

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

// Live API object type names (from LiveAPI.type property)
export const LIVE_API_TYPE = {
  TRACK: "Track",
  SCENE: "Scene",
  CLIP: "Clip",
  DEVICE: "Device",
};

export const VALID_DEVICES = {
  instruments: [
    "Analog",
    "Collision",
    "Drift",
    "Drum Rack",
    "DrumSampler",
    "Electric",
    "External Instrument",
    "Impulse",
    "Instrument Rack",
    "Meld",
    "Operator",
    "Sampler",
    "Simpler",
    "Tension",
    "Wavetable",
  ],
  midiEffects: [
    "Arpeggiator",
    "CC Control",
    "Chord",
    "MIDI Effect Rack",
    "Note Length",
    "Pitch",
    "Random",
    "Scale",
    "Velocity",
  ],
  audioEffects: [
    "Amp",
    "Audio Effect Rack",
    "Auto Filter",
    "Auto Pan-Tremolo",
    "Auto Shift",
    "Beat Repeat",
    "Cabinet",
    "Channel EQ",
    "Chorus-Ensemble",
    "Compressor",
    "Corpus",
    "Delay",
    "Drum Buss",
    "Dynamic Tube",
    "Echo",
    "EQ Eight",
    "EQ Three",
    "Erosion",
    "External Audio Effect",
    "Filter Delay",
    "Gate",
    "Glue Compressor",
    "Grain Delay",
    "Hybrid Reverb",
    "Limiter",
    "Looper",
    "Multiband Dynamics",
    "Overdrive",
    "Pedal",
    "Phaser-Flanger",
    "Redux",
    "Resonators",
    "Reverb",
    "Roar",
    "Saturator",
    "Shifter",
    "Spectral Resonator",
    "Spectral Time",
    "Spectrum",
    "Tuner",
    "Utility",
    "Vinyl Distortion",
    "Vocoder",
  ],
};

export const ALL_VALID_DEVICES = [
  ...VALID_DEVICES.instruments,
  ...VALID_DEVICES.midiEffects,
  ...VALID_DEVICES.audioEffects,
];
