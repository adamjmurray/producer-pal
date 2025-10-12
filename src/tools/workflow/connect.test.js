import { describe, expect, it, vi } from "vitest";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "../../test/mock-live-api.js";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "../constants.js";
import { connect } from "./connect.js";

// Mock the getHostTrackIndex function
vi.mock(import("../shared/get-host-track-index.js"), () => ({
  getHostTrackIndex: vi.fn(() => 1), // Default to track index 1
}));

import { getHostTrackIndex } from "../shared/get-host-track-index.js";

describe("connect", () => {
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

    const result = connect();

    expect(result).toEqual({
      connected: true,
      producerPalVersion: "0.9.10",
      abletonLiveVersion: "12.3",
      liveSet: {
        name: "Test Project",
        trackCount: 3,
        sceneCount: 2,
        tempo: 120,
        timeSignature: "4/4",
      },
      messagesForUser: expect.stringContaining(
        "Producer Pal 0.9.10 connected to Ableton Live 12.3",
      ),
      $skills: expect.stringContaining("Producer Pal Skills"),
      $instructions: expect.stringContaining(
        "complete Producer Pal initialization",
      ),
    });

    expect(result.messagesForUser).toContain("Save often!");
    expect(result.messagesForUser).toContain(
      "Tell me if you rearrange things so I stay in sync.",
    );

    expect(result.$instructions).toContain(
      "Call ppal-read-live-set _with no arguments_",
    );
    expect(result.$instructions).toContain("Summarize the Live Set");
    expect(result.$instructions).toContain("Say the messagesForUser");
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

    const result = connect();

    expect(result).toEqual(
      expect.objectContaining({
        liveSet: expect.objectContaining({
          tempo: 140,
          timeSignature: "3/4",
        }),
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
      track0: {
        has_midi_input: 1,
        devices: children("synth_device"),
      },
      track1: {
        has_midi_input: 1,
        devices: [],
      },
      synth_device: {
        type: LIVE_API_DEVICE_TYPE_INSTRUMENT,
      },
    });

    getHostTrackIndex.mockReturnValue(1); // Host track is track 1, synth is on track 0

    const result = connect();

    expect(result.messagesForUser).toEqual(
      expect.stringContaining("* Save often!"),
    );
    expect(result.messagesForUser).not.toContain("No instruments found.");
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

  //   const result = connect();

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

    const result = connect();

    expect(result.messagesForUser).toEqual(
      expect.stringContaining("* No instruments found."),
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

    const result = connect({}, context);

    expect(result.projectNotes).toEqual(
      "Working on a house track with heavy bass",
    );
    expect(result.$instructions).toContain("Summarize the project notes");
    expect(result.$instructions).toContain(
      "follow instructions in project notes",
    );
  });

  it("notes when project notes are writable", () => {
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
        writable: true,
        content: "Working on a house track with heavy bass",
      },
    };

    const result = connect({}, context);

    expect(result.projectNotes).toEqual(
      "Working on a house track with heavy bass",
    );
    expect(result.$instructions).toContain("Summarize the project notes");
    expect(result.$instructions).toContain(
      "follow instructions in project notes",
    );
    expect(result.$instructions).toContain(
      "mention you can update the project notes",
    );
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

    const result = connect({}, context);

    expect(result.projectNotes).toBeUndefined();
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

    const result = connect();

    expect(result.projectNotes).toBeUndefined();
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

    const result = connect();

    // Should still work - just won't find instruments on host track
    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        liveSet: expect.objectContaining({
          trackCount: 1,
          sceneCount: 1,
        }),
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

    const result = connect();

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        liveSet: expect.objectContaining({
          trackCount: 0,
          sceneCount: 0,
        }),
        messagesForUser: expect.stringContaining("* No instruments found"),
      }),
    );
  });

  it("includes scale property when scale is enabled", () => {
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
        name: "Scale Test Project",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 0,
        tracks: [],
        scenes: [],
        scale_mode: 1, // Scale enabled
        scale_name: "Minor",
        root_note: 3, // D#
      },
      AppView: {
        focused_document_view: "Session",
      },
    });

    getHostTrackIndex.mockReturnValue(0);

    const result = connect();

    expect(result.liveSet.scale).toBe("Eb Minor");
  });

  it("excludes scale property when scale is disabled", () => {
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
        name: "No Scale Project",
        tempo: 120,
        signature_numerator: 4,
        signature_denominator: 4,
        is_playing: 0,
        tracks: [],
        scenes: [],
        scale_mode: 0, // Scale disabled
        scale_name: "Major",
        root_note: 0,
      },
      AppView: {
        focused_document_view: "Session",
      },
    });

    getHostTrackIndex.mockReturnValue(0);

    const result = connect();

    expect(result.liveSet.scale).toBeUndefined();
  });

  it("omits name property when Live Set name is empty string", () => {
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
        name: "", // Empty name
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

    const result = connect();

    expect(result.liveSet.name).toBeUndefined();
    expect(result.liveSet).not.toHaveProperty("name");
  });

  it("returns standard skills and instructions by default", () => {
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
        name: "Test Project",
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

    const result = connect();

    expect(result.$skills).toContain("Producer Pal Skills");
    expect(result.$skills).toContain("## Techniques");
    expect(result.$instructions).toContain(
      "Call ppal-read-live-set _with no arguments_",
    );
  });

  it("returns basic skills and instructions when smallModelMode is enabled", () => {
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
        name: "Small Model Project",
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
      smallModelMode: true,
    };

    const result = connect({}, context);

    expect(result.$skills).toContain("Producer Pal Skills");
    expect(result.$skills).not.toContain("## Techniques");
    expect(result.$instructions).not.toContain("Call ppal-read-live-set");
    expect(result.$instructions).toContain("Summarize the Live Set");
  });

  it("standard skills include advanced features that basic skills omit", () => {
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
        name: "Test Project",
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

    const standardResult = connect({}, {});
    const basicResult = connect({}, { smallModelMode: true });

    // Standard includes advanced features
    expect(standardResult.$skills).toContain("@N="); // bar copying
    expect(standardResult.$skills).toContain("v0 C3 1|1"); // v0 deletion
    expect(standardResult.$skills).toContain("## Techniques");
    expect(standardResult.$skills).toContain("**Creating Music:**");
    expect(standardResult.$skills).toContain("velocity dynamics");
    expect(standardResult.$skills).toContain("routeToSource");

    // Basic omits advanced features
    expect(basicResult.$skills).not.toContain("@N=");
    expect(basicResult.$skills).not.toContain("v0 C3 1|1");
    expect(basicResult.$skills).not.toContain("## Techniques");
    expect(basicResult.$skills).not.toContain("**Creating Music:**");
    expect(basicResult.$skills).not.toContain("velocity dynamics");
    expect(basicResult.$skills).not.toContain("routeToSource");
  });

  it("standard instructions include ppal-read-live-set call", () => {
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
        name: "Test Project",
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

    const standardResult = connect({}, {});
    const basicResult = connect({}, { smallModelMode: true });

    // Standard includes explicit call to ppal-read-live-set
    expect(standardResult.$instructions).toContain(
      "Call ppal-read-live-set _with no arguments_",
    );
    expect(standardResult.$instructions).toContain(
      "if ppal-read-live-set fails",
    );

    // Basic omits ppal-read-live-set call
    expect(basicResult.$instructions).not.toContain("ppal-read-live-set");

    // Both include common instructions
    expect(standardResult.$instructions).toContain("Summarize the Live Set");
    expect(standardResult.$instructions).toContain("messagesForUser");
    expect(basicResult.$instructions).toContain("Summarize the Live Set");
    expect(basicResult.$instructions).toContain("messagesForUser");
  });
});
