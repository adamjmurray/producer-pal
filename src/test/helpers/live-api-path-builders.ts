// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

//
// Chainable path builders for constructing realistic Live API paths in tests.
//
// Usage:
//   livePath.track(0)                         // "live_set tracks 0"
//   livePath.track(0).device(1)               // "live_set tracks 0 devices 1"
//   livePath.track(0).clipSlot(2).clip()      // "live_set tracks 0 clip_slots 2 clip"
//   livePath.track(0).arrangementClip(0)      // "live_set tracks 0 arrangement_clips 0"
//   livePath.track(0).device(0).parameter(1)  // "live_set tracks 0 devices 0 parameters 1"
//   livePath.scene(0)                         // "live_set scenes 0"
//   livePath.cuePoint(0)                      // "live_set cue_points 0"
//

// Path type accepted by registerMockObject and other test helpers
export type PathLike = string | { toString: () => string };

// Intermediate builder: device path with .parameter() chaining
class DevicePath {
  private readonly base: string;

  constructor(trackBase: string, deviceIndex: number) {
    this.base = `${trackBase} devices ${deviceIndex}`;
  }

  toString(): string {
    return this.base;
  }

  // "...devices X parameters Y"
  parameter(paramIndex: number): string {
    return `${this.base} parameters ${paramIndex}`;
  }
}

// Intermediate builder: clip slot path with .clip() chaining
class ClipSlotPath {
  private readonly base: string;

  constructor(trackBase: string, slotIndex: number) {
    this.base = `${trackBase} clip_slots ${slotIndex}`;
  }

  toString(): string {
    return this.base;
  }

  // "...clip_slots X clip"
  clip(): string {
    return `${this.base} clip`;
  }
}

// Intermediate builder: track path with chaining methods
class TrackPath {
  private readonly base: string;

  constructor(base: string) {
    this.base = base;
  }

  toString(): string {
    return this.base;
  }

  // "...devices X" (chainable — returns DevicePath for .parameter())
  device(deviceIndex: number): DevicePath {
    return new DevicePath(this.base, deviceIndex);
  }

  // "...clip_slots X" (chainable — returns ClipSlotPath for .clip())
  clipSlot(slotIndex: number): ClipSlotPath {
    return new ClipSlotPath(this.base, slotIndex);
  }

  // "...arrangement_clips X"
  arrangementClip(clipIndex: number): string {
    return `${this.base} arrangement_clips ${clipIndex}`;
  }

  // "...mixer_device"
  mixerDevice(): string {
    return `${this.base} mixer_device`;
  }
}

export const livePath = {
  // "live_set tracks X" (chainable)
  track: (index: number): TrackPath =>
    new TrackPath(`live_set tracks ${index}`),

  // "live_set return_tracks X"
  returnTrack: (index: number): string => `live_set return_tracks ${index}`,

  // "live_set master_track"
  masterTrack: (): string => "live_set master_track",

  // "live_set scenes X"
  scene: (index: number): string => `live_set scenes ${index}`,

  // "live_set cue_points X"
  cuePoint: (index: number): string => `live_set cue_points ${index}`,
};
