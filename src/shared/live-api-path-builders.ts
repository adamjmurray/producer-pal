// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

//
// Chainable path builders for constructing Live API paths.
//
// Usage:
//   livePath.track(0)                                // "live_set tracks 0"
//   livePath.track(0).device(1)                      // "live_set tracks 0 devices 1"
//   livePath.track(0).clipSlot(2).clip()             // "live_set tracks 0 clip_slots 2 clip"
//   livePath.track(0).arrangementClip(0)             // "live_set tracks 0 arrangement_clips 0"
//   livePath.track(0).device(0).parameter(1)         // "live_set tracks 0 devices 0 parameters 1"
//   livePath.track(0).device(0).chain(1).device(0)   // "live_set tracks 0 devices 0 chains 1 devices 0"
//   livePath.returnTrack(0).device(1)                // "live_set return_tracks 0 devices 1"
//   livePath.masterTrack().mixerDevice()             // "live_set master_track mixer_device"
//   livePath.scene(0)                                // "live_set scenes 0"
//   livePath.cuePoint(0)                             // "live_set cue_points 0"
//   livePath.liveSet                                 // "live_set"
//   livePath.view.selectedTrack                      // "live_set view selected_track"
//

// Type accepted anywhere a Live API path string is expected
export type PathLike = string | { toString: () => string };

// Intermediate builder: chain path with .device() for nesting
class ChainPath {
  private readonly base: string;

  constructor(parentBase: string, collection: string, chainIndex: number) {
    this.base = `${parentBase} ${collection} ${chainIndex}`;
  }

  toString(): string {
    return this.base;
  }

  // "...chains X devices Y" (chainable — returns DevicePath)
  device(deviceIndex: number): DevicePath {
    return new DevicePath(this.base, deviceIndex);
  }
}

// Intermediate builder: device path with chaining
class DevicePath {
  private readonly base: string;

  constructor(parentBase: string, deviceIndex: number) {
    this.base = `${parentBase} devices ${deviceIndex}`;
  }

  toString(): string {
    return this.base;
  }

  // "...devices X parameters Y"
  parameter(paramIndex: number): string {
    return `${this.base} parameters ${paramIndex}`;
  }

  // "...devices X chains Y" (chainable — returns ChainPath)
  chain(chainIndex: number): ChainPath {
    return new ChainPath(this.base, "chains", chainIndex);
  }

  // "...devices X return_chains Y" (chainable — returns ChainPath)
  returnChain(chainIndex: number): ChainPath {
    return new ChainPath(this.base, "return_chains", chainIndex);
  }

  // "...devices X drum_pads Y"
  drumPad(padIndex: number): string {
    return `${this.base} drum_pads ${padIndex}`;
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
export class TrackPath {
  private readonly base: string;

  constructor(base: string) {
    this.base = base;
  }

  toString(): string {
    return this.base;
  }

  // "...devices X" (chainable — returns DevicePath)
  device(deviceIndex: number): DevicePath {
    return new DevicePath(this.base, deviceIndex);
  }

  // "...clip_slots X" (chainable — returns ClipSlotPath)
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

  // "live_set return_tracks X" (chainable)
  returnTrack: (index: number): TrackPath =>
    new TrackPath(`live_set return_tracks ${index}`),

  // "live_set master_track" (chainable)
  masterTrack: (): TrackPath => new TrackPath("live_set master_track"),

  // "live_set scenes X"
  scene: (index: number): string => `live_set scenes ${index}`,

  // "live_set cue_points X"
  cuePoint: (index: number): string => `live_set cue_points ${index}`,

  // "live_set"
  liveSet: "live_set" as const,

  // View paths
  view: {
    song: "live_set view",
    app: "live_app view",
    selectedTrack: "live_set view selected_track",
    selectedScene: "live_set view selected_scene",
    detailClip: "live_set view detail_clip",
    highlightedClipSlot: "live_set view highlighted_clip_slot",
  },
};
