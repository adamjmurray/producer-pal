import { describe, expect, it, vi } from "vitest";
import {
  liveApiCall,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
} from "#src/test/mock-live-api.js";
import { getHostTrackIndex } from "../shared/arrangement/get-host-track-index.js";
import { connect } from "./connect.js";

// Mock the getHostTrackIndex function
vi.mock(import("../shared/arrangement/get-host-track-index.js"), () => ({
  getHostTrackIndex: vi.fn(() => 1), // Default to track index 1
}));

describe("connect", () => {
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

    expect(result.projectNotes).toStrictEqual(
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

    expect(result.projectNotes).toStrictEqual(
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
