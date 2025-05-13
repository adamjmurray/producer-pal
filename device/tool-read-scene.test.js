// device/tool-read-scene.test.js
import { describe, expect, it } from "vitest";
import { children, expectedClip, liveApiId, mockLiveApiGet } from "./mock-live-api";
import { readScene } from "./tool-read-scene";

describe("readScene", () => {
  it("returns scene information when a valid scene exists", () => {
    liveApiId.mockReturnValue("scene1");
    mockLiveApiGet({
      Scene: {
        name: "Test Scene",
        color: 16711680, // Red
        is_empty: 0,
        is_triggered: 0,
        tempo: 120,
        tempo_enabled: 1,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        time_signature_enabled: 1,
      },
    });

    const result = readScene({ sceneIndex: 0 });

    expect(result).toEqual({
      id: "scene1",
      name: "Test Scene",
      sceneIndex: 0,
      color: "#FF0000",
      isEmpty: false,
      isTriggered: false,
      tempo: 120,
      isTempoEnabled: true,
      timeSignature: "4/4",
      isTimeSignatureEnabled: true,
    });
  });

  it("returns null values when no scene exists", () => {
    liveApiId.mockReturnValue("id 0");

    const result = readScene({ sceneIndex: 99 });

    expect(result).toEqual({
      id: null,
      name: null,
      sceneIndex: 99,
    });
  });

  it("handles disabled tempo and time signature", () => {
    liveApiId.mockReturnValue("scene2");
    mockLiveApiGet({
      Scene: {
        name: "Scene with Disabled Properties",
        color: 65280, // Green
        is_empty: 1,
        is_triggered: 1,
        tempo: -1, // -1 indicates disabled tempo
        tempo_enabled: 0,
        time_signature_numerator: -1, // -1 indicates disabled time signature
        time_signature_denominator: -1,
        time_signature_enabled: 0,
      },
    });

    const result = readScene({ sceneIndex: 1 });

    expect(result).toEqual({
      id: "scene2",
      name: "Scene with Disabled Properties",
      sceneIndex: 1,
      color: "#00FF00",
      isEmpty: true,
      isTriggered: true,
      tempo: -1,
      isTempoEnabled: false,
      timeSignature: "-1/-1",
      isTimeSignatureEnabled: false,
    });
  });

  it("includes clip information when includeClips is true", () => {
    liveApiId.mockImplementation(function () {
      switch (this.path) {
        case "live_set":
          return "live_set_id";
        case "live_set scenes 0":
          return "scene_0";
        case "live_set tracks 0 clip_slots 0 clip":
          return "clip_0_0";
        case "live_set tracks 1 clip_slots 0 clip":
          return "clip_1_0";
        default:
          return "id 0";
      }
    });

    mockLiveApiGet({
      LiveSet: {
        tracks: children("track1", "track2"),
      },
      Scene: {
        name: "Scene with Clips",
        color: 16711680,
        is_empty: 0,
        is_triggered: 0,
        tempo: 120,
        tempo_enabled: 1,
        time_signature_numerator: 4,
        time_signature_denominator: 4,
        time_signature_enabled: 1,
      },
    });

    const result = readScene({ sceneIndex: 0, includeClips: true });

    expect(result).toEqual({
      id: "scene_0",
      name: "Scene with Clips",
      sceneIndex: 0,
      color: "#FF0000",
      isEmpty: false,
      isTriggered: false,
      tempo: 120,
      isTempoEnabled: true,
      timeSignature: "4/4",
      isTimeSignatureEnabled: true,
      clips: [
        expectedClip({ id: "clip_0_0", clipSlotIndex: 0, trackIndex: 0 }),
        expectedClip({ id: "clip_1_0", clipSlotIndex: 0, trackIndex: 1 }),
      ],
    });
  });
});
