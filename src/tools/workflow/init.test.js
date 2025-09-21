import { describe, expect, it, vi } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "../../test/mock-live-api.js";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "../constants.js";
import { init } from "./init.js";

// Mock the getHostTrackIndex function
vi.mock(import("../shared/get-host-track-index.js"), () => ({
  getHostTrackIndex: vi.fn(() => 1), // Default to track index 1
}));

import { getHostTrackIndex } from "../shared/get-host-track-index.js";

describe("init", () => {
  it("returns basic Live Set information and connection status", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track0";
        case "live_set tracks 1":
          return "track1";
        case "live_set tracks 2":
          return "track2";
        default:
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.3";
      }
      return null;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Test Project",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 1,
        tracks: children("track0", "track1", "track2"),
        scenes: children("scene0", "scene1"),
      },
      AppView: {
        focused_document_view: "Session",
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        devices: [],
      },
      "live_set tracks 1": {
        has_midi_input: 1,
        devices: [],
      },
      "live_set tracks 2": {
        has_midi_input: 0,
        devices: [],
      },
    });

    const result = init();

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        producerPalVersion: "0.9.7",
        abletonLiveVersion: "12.3",
        songName: "Test Project",
        view: "session",
        tempo: 120,
        timeSignature: "4/4",
        isPlaying: true,
        trackCount: 3,
        sceneCount: 2,
        messagesForUser: expect.arrayContaining([
          "Producer Pal 0.9.7 connected to Ableton Live 12.3",
          "Save often! I can modify and delete things in your project, and I make mistakes.",
          "If you rearrange tracks/clips/scenes, tell me so I stay in sync.",
          expect.any(String), // dynamic message based on Live Set state
        ]),
      }),
    );
  });

  it("handles arrangement view correctly", () => {
    liveApiId.mockImplementation(function () {
      return this._id;
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Arrangement Project",
        tempo: 140,
        signature_numerator: 3,
        signature_denominator: 4,
        is_playing: 0,
        tracks: children("track0"),
        scenes: children("scene0"),
      },
      AppView: {
        focused_document_view: "Arranger",
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        devices: [],
      },
    });

    getHostTrackIndex.mockReturnValue(0);

    const result = init();

    expect(result).toEqual(
      expect.objectContaining({
        view: "arrangement",
        tempo: 140,
        timeSignature: "3/4",
        isPlaying: false,
      }),
    );
  });

  it("detects instruments on non-host tracks and provides appropriate suggestion", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track0";
        case "live_set tracks 1":
          return "track1";
        case "live_set tracks 0 devices 0":
          return "synth_device";
        default:
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Synth Project",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 0,
        tracks: children("track0", "track1"),
        scenes: children("scene0"),
      },
      AppView: {
        focused_document_view: "Session",
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        devices: children("synth_device"),
      },
      "live_set tracks 1": {
        has_midi_input: 1,
        devices: [],
      },
      synth_device: {
        type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      },
    });

    getHostTrackIndex.mockReturnValue(1); // Host track is track 1, synth is on track 0

    const result = init();

    expect(result.messagesForUser).toEqual(
      expect.arrayContaining([expect.stringContaining("Ready to create")]),
    );
  });

  // it("warns when instrument is on host track", () => {
  //   liveApiId.mockImplementation(function () {
  //     switch (this._path) {
  //       case "live_set":
  //         return "live_set_id";
  //       case "live_set tracks 0":
  //         return "track0";
  //       case "live_set tracks 0 devices 0":
  //         return "host_instrument";
  //       default:
  //         return this._id;
  //     }
  //   });

  //   liveApiPath.mockImplementation(function () {
  //     return this._path;
  //   });

  //   liveApiCall.mockImplementation(function (method) {
  //     if (method === "get_version_string") {
  //       return "12.2";
  //     }
  //     return null;
  //   });

  //   mockLiveApiGet({
  //     LiveSet: {
  //       name: "Host Track Project",
  //       tempo: 120,
  //       signature_numerator: 4,
  //       signature_denominator: 4,
  //       is_playing: 0,
  //       tracks: children("track0"),
  //       scenes: children("scene0"),
  //     },
  //     AppView: {
  //       focused_document_view: "Session",
  //     },
  //     "live_set tracks 0": {
  //       has_midi_input: 1,
  //       devices: children("host_instrument"),
  //     },
  //     host_instrument: {
  //       type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
  //     },
  //   });

  //   getHostTrackIndex.mockReturnValue(0); // Host track is track 0 with instrument

  //   const result = init();

  //   expect(result.messagesForUser).toEqual(
  //     expect.arrayContaining([
  //       expect.stringContaining(
  //         "There's an instrument on the Producer Pal track.",
  //       ),
  //       expect.stringContaining("Ready to create"),
  //     ]),
  //   );
  // });

  it("provides no-instruments suggestion when no instruments are found", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track0";
        case "live_set tracks 1":
          return "track1";
        default:
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Empty Project",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 0,
        tracks: children("track0", "track1"),
        scenes: children("scene0"),
      },
      AppView: {
        focused_document_view: "Session",
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        devices: [],
      },
      "live_set tracks 1": {
        has_midi_input: 1,
        devices: [],
      },
    });

    getHostTrackIndex.mockReturnValue(1);

    const result = init();

    expect(result.messagesForUser).toEqual(
      expect.arrayContaining([
        expect.stringContaining("No instruments found."),
      ]),
    );
  });

  it("includes project notes when context is provided and enabled", () => {
    liveApiId.mockImplementation(function () {
      return this._id;
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Project with Notes",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 0,
        tracks: [],
        scenes: [],
      },
      AppView: {
        focused_document_view: "Session",
      },
    });

    getHostTrackIndex.mockReturnValue(0);

    const context = {
      projectNotes: {
        enabled: true,
        content: "Working on a house track with heavy bass",
      },
    };

    const result = init({}, context);

    expect(result.userContext).toEqual({
      projectNotes: "Working on a house track with heavy bass",
    });
  });

  it("excludes project notes when context is disabled", () => {
    liveApiId.mockImplementation(function () {
      return this._id;
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Project without Notes",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 0,
        tracks: [],
        scenes: [],
      },
      AppView: {
        focused_document_view: "Session",
      },
    });

    getHostTrackIndex.mockReturnValue(0);

    const context = {
      projectNotes: {
        enabled: false,
        content: "Should not be included",
      },
    };

    const result = init({}, context);

    expect(result.userContext).toBeUndefined();
  });

  it("handles missing context gracefully", () => {
    liveApiId.mockImplementation(function () {
      return this._id;
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "No Context Project",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 0,
        tracks: [],
        scenes: [],
      },
      AppView: {
        focused_document_view: "Session",
      },
    });

    getHostTrackIndex.mockReturnValue(0);

    const result = init();

    expect(result.userContext).toBeUndefined();
  });

  it("handles null host track index gracefully", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set":
          return "live_set_id";
        case "live_set tracks 0":
          return "track0";
        default:
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "No Host Index Project",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 0,
        tracks: children("track0"),
        scenes: children("scene0"),
      },
      AppView: {
        focused_document_view: "Session",
      },
      "live_set tracks 0": {
        has_midi_input: 1,
        devices: [],
      },
    });

    getHostTrackIndex.mockReturnValue(null); // Host track index not found

    const result = init();

    // Should still work - just won't find instruments on host track
    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        trackCount: 1,
        sceneCount: 1,
      }),
    );
  });

  it("handles empty Live Set correctly", () => {
    liveApiId.mockImplementation(function () {
      switch (this._path) {
        case "live_set":
          return "live_set_id";
        default:
          return this._id;
      }
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    mockLiveApiGet({
      LiveSet: {
        name: "Empty Live Set",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 0,
        tracks: [],
        scenes: [],
      },
      AppView: {
        focused_document_view: "Session",
      },
    });

    getHostTrackIndex.mockReturnValue(null);

    const result = init();

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        trackCount: 0,
        sceneCount: 0,
        messagesForUser: expect.arrayContaining([
          expect.stringContaining("No instruments"),
        ]),
      }),
    );
  });

  it("handles fallback song name when name is null", () => {
    liveApiId.mockImplementation(function () {
      return this._id;
    });

    liveApiPath.mockImplementation(function () {
      return this._path;
    });

    liveApiCall.mockImplementation(function (method) {
      if (method === "get_version_string") {
        return "12.2";
      }
      return null;
    });

    mockLiveApiGet({
      LiveSet: {
        name: null, // No name set
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 0,
        tracks: [],
        scenes: [],
      },
      AppView: {
        focused_document_view: "Session",
      },
    });

    getHostTrackIndex.mockReturnValue(0);

    const result = init();

    expect(result.songName).toBe("Untitled");
  });
});
