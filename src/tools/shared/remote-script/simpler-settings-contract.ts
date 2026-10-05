// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What V8 and Node share about a Simpler's pitch bend ranges, which only the
// Producer Pal remote script (remote-script/) can reach. Results are the remote
// script's own JSON, so their fields stay snake_case.

/** The Node routes V8 calls to reach the remote script's `/device/simpler/*`. */
export const SIMPLER_SETTINGS_ROUTES = {
  read: "remoteScript.device.simplerRead",
  write: "remoteScript.device.simplerWrite",
} as const;

/** The most Simplers one read takes; more are asked in chunks. */
export const MAX_SIMPLERS_PER_CALL = 200;

/** Semitones the pitch wheel bends, inclusive. Live clamps anything outside. */
export const PITCH_BEND_RANGE_MAX = 24;

/** Semitones of MPE per-note pitch bend, inclusive. */
export const NOTE_PITCH_BEND_RANGE_MAX = 48;

/** The Simplers to ask about: each one's Live path. */
export interface SimplerReadRequest {
  devicePaths: string[];
}

/** One Simpler to write, and the settings to change; one or both. */
export interface SimplerWriteRequest {
  devicePath: string;
  pitchBendRange?: number;
  notePitchBendRange?: number;
}

/** A Simpler's settings as the remote script reads them. */
export interface SimplerSettingsEntry {
  pitch_bend_range: number;
  note_pitch_bend_range: number;
}

export interface SimplerReadResult {
  /** One per path asked, in order */
  simplers: Array<SimplerSettingsEntry | { error: string }>;
}
