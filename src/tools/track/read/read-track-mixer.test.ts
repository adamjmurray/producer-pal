import { describe, expect, it, vi } from "vitest";
import * as console from "#src/shared/v8-max-console.js";
import {
  children,
  liveApiId,
  mockLiveApiGet,
} from "#src/test/mocks/mock-live-api.js";
import {
  createMixerPathIdMap,
  createMixerWithSendsMock,
  createSplitPanningMock,
  setupMixerIdMock,
} from "./helpers/read-track-test-helpers.js";
import { readTrack } from "./read-track.js";

describe("readTrack - mixer properties", () => {
  it("excludes mixer properties by default", () => {
    liveApiId.mockReturnValue("track1");
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
    });

    const result = readTrack({ trackIndex: 0 });

    expect(result).not.toHaveProperty("gainDb");
    expect(result).not.toHaveProperty("pan");
  });

  it("includes mixer properties when requested", () => {
    setupMixerIdMock(createMixerPathIdMap());
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      DeviceParameter: {
        display_value: 0, // 0 dB
        value: 0, // center pan
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", 0);
    expect(result).toHaveProperty("panningMode", "stereo");
    expect(result).toHaveProperty("pan", 0);
    expect(result).not.toHaveProperty("leftPan");
    expect(result).not.toHaveProperty("rightPan");
  });

  it("includes non-zero gain and panning values", () => {
    setupMixerIdMock(createMixerPathIdMap());
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      volume_param_1: {
        display_value: -6.5, // -6.5 dB
      },
      panning_param_1: {
        value: 0.5, // panned right
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", -6.5);
    expect(result).toHaveProperty("panningMode", "stereo");
    expect(result).toHaveProperty("pan", 0.5);
  });

  it("includes mixer properties for return tracks", () => {
    setupMixerIdMock(
      createMixerPathIdMap({
        trackPath: "live_set return_tracks 0",
        trackId: "return1",
      }),
    );
    mockLiveApiGet({
      Track: {
        has_midi_input: 0,
        name: "Return Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      volume_param_1: {
        display_value: -3,
      },
      panning_param_1: {
        value: -0.5,
      },
    });

    const result = readTrack({
      trackIndex: 0,
      category: "return",
      include: ["mixer"],
    });

    expect(result).toHaveProperty("gainDb", -3);
    expect(result).toHaveProperty("pan", -0.5);
  });

  it("includes mixer properties for master track", () => {
    setupMixerIdMock(
      createMixerPathIdMap({
        trackPath: "live_set master_track",
        trackId: "master",
      }),
    );
    mockLiveApiGet({
      Track: {
        has_midi_input: 0,
        name: "Master",
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      DeviceParameter: {
        display_value: 0,
        value: 0,
      },
    });

    const result = readTrack({ category: "master", include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", 0);
    expect(result).toHaveProperty("pan", 0);
  });

  it("handles missing mixer device gracefully", () => {
    setupMixerIdMock({
      "live_set tracks 0": "track1",
      "live_set tracks 0 mixer_device": "id 0", // Non-existent mixer
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).not.toHaveProperty("gainDb");
    expect(result).not.toHaveProperty("pan");
  });

  it("handles missing volume parameter gracefully", () => {
    setupMixerIdMock({
      ...createMixerPathIdMap(),
      "live_set tracks 0 mixer_device volume": "id 0", // Non-existent volume
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        panning: children("panning_param_1"),
      },
      panning_param_1: {
        value: 0.25,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).not.toHaveProperty("gainDb");
    expect(result).toHaveProperty("pan", 0.25);
  });

  it("handles missing panning parameter gracefully", () => {
    setupMixerIdMock({
      ...createMixerPathIdMap(),
      "live_set tracks 0 mixer_device panning": "id 0", // Non-existent panning
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        volume: children("volume_param_1"),
      },
      volume_param_1: {
        display_value: -12,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", -12);
    expect(result).not.toHaveProperty("pan");
  });

  it("includes mixer with wildcard include", () => {
    setupMixerIdMock(createMixerPathIdMap());
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      MixerDevice: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
      },
      volume_param_1: {
        display_value: 2,
      },
      panning_param_1: {
        value: -0.25,
      },
    });

    const result = readTrack({ trackIndex: 0, include: ["*"] });

    expect(result).toHaveProperty("gainDb", 2);
    expect(result).toHaveProperty("pan", -0.25);
  });

  it("returns split panning mode with leftPan and rightPan", () => {
    setupMixerIdMock(
      createMixerPathIdMap({
        leftSplitId: "left_split_param_1",
        rightSplitId: "right_split_param_1",
      }),
    );
    mockLiveApiGet(
      createSplitPanningMock({
        gainDb: -3,
        leftPan: -1,
        rightPan: 1,
      }) as unknown as Record<string, Record<string, unknown>>,
    );

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", -3);
    expect(result).toHaveProperty("panningMode", "split");
    expect(result).toHaveProperty("leftPan", -1);
    expect(result).toHaveProperty("rightPan", 1);
    expect(result).not.toHaveProperty("pan");
  });

  it("returns split panning mode with non-default values", () => {
    setupMixerIdMock(
      createMixerPathIdMap({
        leftSplitId: "left_split_param_1",
        rightSplitId: "right_split_param_1",
      }),
    );
    mockLiveApiGet(
      createSplitPanningMock({
        gainDb: 0,
        leftPan: 0.25,
        rightPan: -0.5,
      }) as unknown as Record<string, Record<string, unknown>>,
    );

    const result = readTrack({ trackIndex: 0, include: ["mixer"] });

    expect(result).toHaveProperty("gainDb", 0);
    expect(result).toHaveProperty("panningMode", "split");
    expect(result).toHaveProperty("leftPan", 0.25);
    expect(result).toHaveProperty("rightPan", -0.5);
    expect(result).not.toHaveProperty("pan");
  });

  it("includes sends with return track names when requested", () => {
    setupMixerIdMock(createMixerPathIdMap());
    mockLiveApiGet(
      createMixerWithSendsMock({
        sendIds: ["send_1", "send_2"],
        sendValues: [-12.5, -6.0],
      }) as unknown as Record<string, Record<string, unknown>>,
    );

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTrackNames: ["Reverb", "Delay"],
    });

    expect(result).toHaveProperty("sends");
    const sends = result.sends as Record<string, unknown>[];

    expect(sends).toHaveLength(2);
    expect(sends[0]).toStrictEqual({ gainDb: -12.5, return: "Reverb" });
    expect(sends[1]).toStrictEqual({ gainDb: -6.0, return: "Delay" });
  });

  it("does not include sends property when track has no sends", () => {
    setupMixerIdMock(createMixerPathIdMap());
    mockLiveApiGet(
      createMixerWithSendsMock({
        sendIds: [],
        sendValues: [],
      }) as unknown as Record<string, Record<string, unknown>>,
    );

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTrackNames: ["Reverb"],
    });

    expect(result).not.toHaveProperty("sends");
  });

  it("fetches return track names if not provided", () => {
    setupMixerIdMock({
      ...createMixerPathIdMap(),
      live_set: "liveSet",
      "live_set return_tracks 0": "return1",
    });
    mockLiveApiGet({
      Track: {
        has_midi_input: 1,
        name: "Test Track",
        clip_slots: [],
        devices: [],
        mixer_device: children("mixer_1"),
      },
      mixer_1: {
        volume: children("volume_param_1"),
        panning: children("panning_param_1"),
        sends: children("send_1"),
        panning_mode: 0,
      },
      send_1: {
        display_value: -10.0,
      },
      volume_param_1: {
        display_value: 0,
      },
      panning_param_1: {
        value: 0,
      },
      liveSet: {
        return_tracks: children("return1"),
      },
      return1: {
        name: "FetchedReverb",
      },
    });

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      // Note: returnTrackNames not provided
    });

    expect(result).toHaveProperty("sends");
    const sends = result.sends as Record<string, unknown>[];

    expect(sends).toHaveLength(1);
    expect(sends[0]).toStrictEqual({
      gainDb: -10.0,
      return: "FetchedReverb",
    });
  });

  it("warns when send count doesn't match return track count", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    setupMixerIdMock(createMixerPathIdMap());
    mockLiveApiGet(
      createMixerWithSendsMock({
        sendIds: ["send_1", "send_2"],
        sendValues: [-12.5, -6.0],
      }) as unknown as Record<string, Record<string, unknown>>,
    );

    const result = readTrack({
      trackIndex: 0,
      include: ["mixer"],
      returnTrackNames: ["Reverb"], // Only 1 return track name, but 2 sends
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      "Send count (2) doesn't match return track count (1)",
    );
    // Still returns sends with fallback for missing name
    const sends = result.sends as Record<string, unknown>[];

    expect(sends).toHaveLength(2);
    expect(sends[0]).toStrictEqual({ gainDb: -12.5, return: "Reverb" });
    expect(sends[1]).toStrictEqual({ gainDb: -6.0, return: "Return 2" });

    consoleSpy.mockRestore();
  });
});
