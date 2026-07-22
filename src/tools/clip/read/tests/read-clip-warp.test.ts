// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
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

function readClipWithWarp(): ReturnType<typeof readClip> {
  return readClip({ trackIndex: 0, sceneIndex: 0, include: ["warp"] });
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

    expect(readClipWithWarp().warpMarkers).toStrictEqual([
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

    expect(readClipWithWarp().warpMarkers).toStrictEqual([
      { sampleTime: 0, beatTime: 0 },
      { sampleTime: 44100, beatTime: 1.0 },
    ]);
  });

  it("handles empty warp markers gracefully", () => {
    setupAudioClipWithWarpMarkers("", "Audio No Markers");

    expect(readClipWithWarp().warpMarkers).toBeUndefined();
  });

  it("handles invalid warp markers JSON gracefully", () => {
    setupAudioClipWithWarpMarkers("invalid json{", "Audio Invalid JSON");

    expect(readClipWithWarp().warpMarkers).toBeUndefined();
  });

  it("does not include warp markers when not requested", () => {
    setupAudioClipWithWarpMarkers(
      JSON.stringify([{ sample_time: 0, beat_time: 0 }]),
    );
    const result = readClip({ trackIndex: 0, sceneIndex: 0 });

    expect(result.warpMarkers).toBeUndefined();
  });

  it('reports an unrecognized warp mode as "unknown"', () => {
    setupAudioClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 0,
        name: "Future Warp Mode",
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        // A warp mode Live could add in the future, absent from WARP_MODE_MAPPING
        warp_mode: 999,
        warping: 1,
      },
    });

    expect(readClipWithWarp().warpMode).toBe("unknown");
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
    expect(readClipWithWarp().warpMarkers).toBeUndefined();
  });

  it("reports warping=false when the clip is not warped", () => {
    // Boundary: warping property === 0. `> 0` must yield false, and the value
    // must not be forced to a constant true.
    setupAudioClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 0,
        name: "Unwarped Audio",
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        warp_mode: 0,
        warping: 0,
      },
    });

    expect(readClipWithWarp().warping).toBe(false);
  });

  it("omits warp properties when warp is not requested (sample only)", () => {
    // includeWarp is false here, so the warp branch must be skipped entirely:
    // no sampleLength/sampleRate/warping/warpMode even though the props exist.
    setupAudioClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 0,
        name: "Audio Sample",
        signature_numerator: 4,
        signature_denominator: 4,
        length: 4,
        sample_length: 88200,
        sample_rate: 44100,
        warp_mode: 4,
        warping: 1,
      },
    });

    const result = readClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["sample"],
    });

    expect(result.sampleLength).toBeUndefined();
    expect(result.sampleRate).toBeUndefined();
    expect(result.warping).toBeUndefined();
    expect(result.warpMode).toBeUndefined();
  });

  it("omits warp markers when ENABLE_WARP_MARKERS is not 'true'", () => {
    // The warp-marker block is gated on the env flag. With the flag off, markers
    // must not be read even for a warped clip that has warp_markers data.
    const original = process.env.ENABLE_WARP_MARKERS;

    process.env.ENABLE_WARP_MARKERS = "false";

    try {
      setupAudioClipMock({
        trackIndex: 0,
        sceneIndex: 0,
        clipProps: {
          is_midi_clip: 0,
          name: "Warped Audio",
          signature_numerator: 4,
          signature_denominator: 4,
          length: 4,
          warp_mode: 4,
          warping: 1,
          warp_markers: JSON.stringify([{ sample_time: 0, beat_time: 0 }]),
        },
      });

      const result = readClipWithWarp();

      expect(result.warpMarkers).toBeUndefined();
      // Other warp properties are still read (proves the clip is warped and the
      // block ran up to the marker gate).
      expect(result.warping).toBe(true);
    } finally {
      process.env.ENABLE_WARP_MARKERS = original;
    }
  });
});
