// device/tool-read-live-set.test.js
import { describe, expect, it } from "vitest";
import { children, expectedClip, expectedTrack, liveApiId, mockLiveApiGet } from "./mock-live-api";
import { readLiveSet } from "./tool-read-live-set";

describe("readLiveSet", () => {
  it("returns live set information including tracks", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track1";
        case "live_set tracks 1":
          return "track2";
        case "live_set tracks 2":
          return "track3";
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip1";
        case "live_set tracks 0 clip_slots 2 clip":
          return "clip2";
        case "live_set tracks 1 clip_slots 0 clip":
          return "clip3";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Live Set",
        is_playing: 1,
        scale_mode: 1,
        scale_name: "Major",
        root_note: 0,
        scale_intervals: [0, 2, 4, 5, 7, 9, 11],
        signature_numerator: 4,
        signature_denominator: 4,
        tempo: 120,
        tracks: children("track1", "track2", "track3"),
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        name: "MIDI Track 1",
        color: 16711680, // Red
        mute: 0,
        solo: 1,
        arm: 1,
        clip_slots: children("slot1", "slot2", "slot3"),
      },
      "live_set tracks 1": {
        has_midi_input: 0,
        name: "Audio Track 2",
        color: 65280, // Green
        mute: 1,
        solo: 0,
        arm: 0,
        clip_slots: children("slot4"),
      },
    });

    // TODO: sanity check drum pads too

    const result = readLiveSet();

    expect(result).toEqual({
      id: "live_set_id",
      name: "Test Live Set",
      isPlaying: true,
      tempo: 120,
      timeSignature: "4/4",
      isScaleModeEnabled: true,
      scaleName: "Major",
      scaleRootNote: 0,
      scaleIntervals: [0, 2, 4, 5, 7, 9, 11],
      trackCount: 3,
      tracks: [
        {
          id: "track1",
          type: "midi",
          name: "MIDI Track 1",
          trackIndex: 0,
          color: "#FF0000",
          isMuted: false,
          isSoloed: true,
          isArmed: true,
          playingSlotIndex: 2,
          firedSlotIndex: 3,
          drumPads: null,
          clips: [
            expectedClip({ id: "clip1", trackIndex: 0, clipSlotIndex: 0 }),
            expectedClip({ id: "clip2", trackIndex: 0, clipSlotIndex: 2 }),
          ],
        },
        {
          id: "track2",
          type: "audio",
          name: "Audio Track 2",
          trackIndex: 1,
          color: "#00FF00",
          isMuted: true,
          isSoloed: false,
          isArmed: false,
          playingSlotIndex: 2,
          firedSlotIndex: 3,
          drumPads: null,
          clips: [expectedClip({ id: "clip3", trackIndex: 1, clipSlotIndex: 0 })],
        },
        expectedTrack({ id: "track3", trackIndex: 2 }),
      ],
    });
  });

  it("handles when no tracks exist", () => {
    mockLiveApiGet({
      LiveSet: {
        name: "Empty Live Set",
        is_playing: 0,
        scale_mode: 0,
        scale_name: "Minor",
        root_note: 2,
        scale_intervals: [0, 2, 3, 5, 7, 8, 10],
        signature_numerator: 3,
        signature_denominator: 4,
        tempo: 100,
        tracks: [],
      },
    });

    const result = readLiveSet();

    expect(result).toEqual({
      id: "1",
      name: "Empty Live Set",
      tempo: 100,
      timeSignature: "3/4",
      isPlaying: false,
      isScaleModeEnabled: false,
      scaleIntervals: [0, 2, 3, 5, 7, 8, 10],
      scaleName: "Minor",
      scaleRootNote: 2,
      trackCount: 0,
      tracks: [],
    });
  });
});
