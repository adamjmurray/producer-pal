// device/tool-list-tracks.test.js
import { describe, it, expect, vi } from "vitest";
import { children, mockLiveApiGet } from "./mock-live-api";
import { listTracks } from "./tool-list-tracks";

describe("listTracks", () => {
  it("returns an empty array when no tracks exist", () => {
    mockLiveApiGet({
      LiveSet: { tracks: [] },
    });
    const result = listTracks();
    expect(result).toEqual([]);
  });

  it("handles tracks with no clips", () => {
    mockLiveApiGet({
      LiveSet: { tracks: children("track1") },
      track1: {
        clip_slots: children(["slot1"]),
        has_midi_input: 1,
        name: "Empty Track",
        color: 255, // Blue
        mute: 0,
        solo: 0,
        arm: 0,
      },
      slot1: { has_clip: 0 },
    });

    const result = listTracks();

    expect(result).toEqual([
      {
        id: "track1",
        index: 0,
        name: "Empty Track",
        color: "#0000FF",
        type: "midi",
        isMuted: false,
        isSoloed: false,
        isArmed: false,
        clips: [],
      },
    ]);
  });

  it("returns track information for multiple tracks with clips", () => {
    mockLiveApiGet({
      LiveSet: { tracks: children("track1", "track2") },
      track1: {
        clip_slots: children("slot1", "slot2"),
        has_midi_input: 1,
        name: "MIDI Track 1",
        color: 16711680, // Red
        mute: 0,
        solo: 1,
        arm: 1,
      },
      track2: {
        clip_slots: children("slot3"),
        has_midi_input: 0,
        name: "Audio Track 2",
        color: 65280, // Green
        mute: 1,
        solo: 0,
        arm: 0,
      },
      slot1: { has_clip: 1 },
    });

    const result = listTracks();

    expect(result).toHaveLength(2);

    expect(result).toEqual([
      {
        id: "track1",
        index: 0,
        name: "MIDI Track 1",
        color: "#FF0000",
        type: "midi",
        isMuted: false,
        isSoloed: true,
        isArmed: true,
        clips: [
          expect.objectContaining({
            type: "midi",
            trackIndex: 0,
            clipSlotIndex: 0,
          }),
        ],
      },
      {
        id: "track2",
        index: 1,
        name: "Audio Track 2",
        color: "#00FF00",
        type: "audio",
        isMuted: true,
        isSoloed: false,
        isArmed: false,
        clips: [],
      },
    ]);
  });
});
