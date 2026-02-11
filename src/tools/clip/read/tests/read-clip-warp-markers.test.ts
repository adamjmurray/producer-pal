// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { readClip } from "#src/tools/clip/read/read-clip.ts";
import {
  setupAudioClipMock,
  setupMidiClipMock,
} from "./read-clip-test-helpers.ts";

function setupAudioClipWithWarpMarkers(
  warpMarkers: string,
  name = "Warped Audio",
): void {
  setupAudioClipMock({
    trackIndex: 0,
    sceneIndex: 0,
    clipProps: {
      is_midi_clip: 0,
      name,
      signature_numerator: 4,
      signature_denominator: 4,
      length: 4,
      warp_mode: 4,
      warping: 1,
      warp_markers: warpMarkers,
    },
  });
}

describe("readClip - warp markers", () => {
  it("reads warp markers with direct array format", () => {
    setupAudioClipWithWarpMarkers(
      JSON.stringify([
        { sample_time: 0, beat_time: 0 },
        { sample_time: 44100, beat_time: 1.0 },
        { sample_time: 88200, beat_time: 2.0 },
      ]),
    );
    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["warp-markers"],
    });

    expect(result.warpMarkers).toStrictEqual([
      { sampleTime: 0, beatTime: 0 },
      { sampleTime: 44100, beatTime: 1.0 },
      { sampleTime: 88200, beatTime: 2.0 },
    ]);
  });

  it("reads warp markers with nested warp_markers property format", () => {
    setupAudioClipWithWarpMarkers(
      JSON.stringify({
        warp_markers: [
          { sample_time: 0, beat_time: 0 },
          { sample_time: 44100, beat_time: 1.0 },
        ],
      }),
    );
    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["warp-markers"],
    });

    expect(result.warpMarkers).toStrictEqual([
      { sampleTime: 0, beatTime: 0 },
      { sampleTime: 44100, beatTime: 1.0 },
    ]);
  });

  it("handles empty warp markers gracefully", () => {
    setupAudioClipWithWarpMarkers("", "Audio No Markers");
    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["warp-markers"],
    });

    expect(result.warpMarkers).toBeUndefined();
  });

  it("handles invalid warp markers JSON gracefully", () => {
    setupAudioClipWithWarpMarkers("invalid json{", "Audio Invalid JSON");
    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["warp-markers"],
    });

    expect(result.warpMarkers).toBeUndefined();
  });

  it("does not include warp markers when not requested", () => {
    setupAudioClipWithWarpMarkers(
      JSON.stringify([{ sample_time: 0, beat_time: 0 }]),
    );
    const result = readClip({ trackIndex: 0, sceneIndex: 0 });

    expect(result.warpMarkers).toBeUndefined();
  });

  it("does not include warp markers for MIDI clips", () => {
    setupMidiClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 1,
        name: "MIDI Clip",
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
      },
    });
    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["warp-markers"],
    });

    expect(result.warpMarkers).toBeUndefined();
  });
});
