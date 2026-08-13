// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
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

describe("readClip - unwarped audio clip timing", () => {
  const SAMPLE_RATE = 48000;

  /**
   * Register a Live Set at `tempo` and an unwarped audio clip. An unwarped
   * clip's marker properties are in seconds, which is the unit switch these
   * tests exist to cover.
   * @param options - Clip configuration
   * @param options.tempo - Live Set tempo
   * @param options.sampleSeconds - The sample's duration in seconds
   * @param options.endMarker - end_marker, in seconds
   */
  function setupUnwarpedAudioClip({
    tempo = 120,
    sampleSeconds,
    endMarker,
  }: {
    tempo?: number;
    sampleSeconds: number;
    endMarker: number;
  }): void {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      type: "Song",
      properties: {
        tempo,
        signature_numerator: 4,
        signature_denominator: 4,
      },
    });

    setupAudioClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: {
        is_midi_clip: 0,
        name: "One Shot",
        signature_numerator: 4,
        signature_denominator: 4,
        looping: 0,
        warping: 0,
        start_marker: 0,
        end_marker: endMarker,
        loop_start: 0,
        loop_end: endMarker,
        sample_rate: SAMPLE_RATE,
        sample_length: sampleSeconds * SAMPLE_RATE,
        // Live reports this as the length the clip would have if still warped,
        // so a correct reading must ignore it
        length: 4,
      },
    });
  }

  it("reports the region in beats, not the raw seconds", () => {
    // A 1.2s one-shot occupies 2.4 beats at 120bpm. Reading end_marker as beats
    // would report 1.2 beats — half the clip.
    setupUnwarpedAudioClip({ sampleSeconds: 1.2, endMarker: 1.2 });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: ["*"] });

    expect(result.warping).toBe(false);
    expect(result.end).toBe("1|3.4");
    expect(result).toHaveLength("n3/5");
  });

  it("clamps a stale end marker left behind by unwarping", () => {
    // end_marker keeps the beat value the warped grid had put there (4),
    // reinterpreted as 4 seconds against a 1.5s file. Live clamps playback at
    // the file boundary, so the region is 1.5s = 3 beats at 120bpm.
    setupUnwarpedAudioClip({ sampleSeconds: 1.5, endMarker: 4 });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: ["*"] });

    expect(result.end).toBe("1|4");
    // 3 beats in 4/4 is a dotted half
    expect(result).toHaveLength("n/2d");
  });

  it("scales the region with tempo, unlike a warped clip", () => {
    setupUnwarpedAudioClip({ tempo: 60, sampleSeconds: 1.2, endMarker: 1.2 });

    const result = readClip({ trackIndex: 0, sceneIndex: 0, include: ["*"] });

    expect(result.end).toBe("1|2.2");
  });
});
