import { describe, expect, it, vi } from "vitest";
import { VERSION } from "#src/shared/version.ts";
import {
  children,
  liveApiCall,
  liveApiId,
  liveApiPath,
  mockLiveApiGet,
  type MockLiveAPIContext,
} from "#src/test/mocks/mock-live-api.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { connect } from "./connect.ts";

// Mock the getHostTrackIndex function
vi.mock(
  import("#src/tools/shared/arrangement/get-host-track-index.ts"),
  () => ({
    getHostTrackIndex: vi.fn(() => 1), // Default to track index 1
  }),
);

function setupBasicMocks(version = "12.2", idMap: Record<string, string> = {}) {
  liveApiId.mockImplementation(function (this: MockLiveAPIContext): string {
    return idMap[this._path ?? ""] ?? this._id ?? "";
  });
  liveApiPath.mockImplementation(function (this: MockLiveAPIContext): string {
    return this._path ?? "";
  });
  liveApiCall.mockImplementation(function (
    this: MockLiveAPIContext,
    method: string,
  ): string | null {
    return method === "get_version_string" ? version : null;
  });
}

interface LiveSetConfigOverrides {
  name?: string;
  tempo?: number;
  signature_numerator?: number;
  signature_denominator?: number;
  is_playing?: number;
  tracks?: string[];
  scenes?: string[];
  liveSetExtra?: Record<string, unknown>;
  view?: string;
  extra?: Record<string, Record<string, unknown>>;
}

interface LiveSetConfig {
  LiveSet: Record<string, unknown>;
  AppView: Record<string, unknown>;
  [key: string]: Record<string, unknown>;
}

function createLiveSetConfig(
  overrides: LiveSetConfigOverrides = {},
): LiveSetConfig {
  const result: LiveSetConfig = {
    LiveSet: {
      name: overrides.name ?? "Test Project",
      tempo: overrides.tempo ?? 120,
      signature_numerator: overrides.signature_numerator ?? 4,
      signature_denominator: overrides.signature_denominator ?? 4,
      is_playing: overrides.is_playing ?? 0,
      tracks: overrides.tracks ?? [],
      scenes: overrides.scenes ?? [],
      ...overrides.liveSetExtra,
    },
    AppView: {
      focused_document_view: overrides.view ?? "Session",
    },
  };

  if (overrides.extra) {
    Object.assign(result, overrides.extra);
  }

  return result;
}

describe("connect", () => {
  it("returns basic Live Set information and connection status", () => {
    setupBasicMocks("12.3", {
      live_set: "live_set_id",
      "live_set tracks 0": "track0",
      "live_set tracks 1": "track1",
      "live_set tracks 2": "track2",
    });

    mockLiveApiGet(
      createLiveSetConfig({
        name: "Test Project",
        is_playing: 1,
        tracks: children("track0", "track1", "track2"),
        scenes: children("scene0", "scene1"),
        extra: {
          "live_set tracks 0": { has_midi_input: 1, devices: [] },
          "live_set tracks 1": { has_midi_input: 1, devices: [] },
          "live_set tracks 2": { has_midi_input: 0, devices: [] },
        },
      }),
    );

    const result = connect();

    expect(result).toStrictEqual({
      connected: true,
      producerPalVersion: VERSION,
      abletonLiveVersion: "12.3",
      liveSet: {
        name: "Test Project",
        trackCount: 3,
        sceneCount: 2,
        tempo: 120,
        timeSignature: "4/4",
      },
      messagesForUser: expect.stringContaining(
        `Producer Pal ${VERSION} connected to Ableton Live 12.3`,
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
    setupBasicMocks();
    mockLiveApiGet(
      createLiveSetConfig({
        name: "Arrangement Project",
        tempo: 140,
        signature_numerator: 3,
        view: "Arranger",
        tracks: children("track0"),
        scenes: children("scene0"),
        extra: { "live_set tracks 0": { has_midi_input: 1, devices: [] } },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    expect(result).toStrictEqual(
      expect.objectContaining({
        liveSet: expect.objectContaining({ tempo: 140, timeSignature: "3/4" }),
      }),
    );
  });

  it("detects instruments on non-host tracks and provides appropriate suggestion", () => {
    setupBasicMocks("12.2", {
      live_set: "live_set_id",
      "live_set tracks 0": "track0",
      "live_set tracks 1": "track1",
      "live_set tracks 0 devices 0": "synth_device",
    });
    mockLiveApiGet(
      createLiveSetConfig({
        name: "Synth Project",
        tracks: children("track0", "track1"),
        scenes: children("scene0"),
        extra: {
          track0: { has_midi_input: 1, devices: children("synth_device") },
          track1: { has_midi_input: 1, devices: [] },
          synth_device: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
        },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(1);

    const result = connect();

    expect(result.messagesForUser).toStrictEqual(
      expect.stringContaining("* Save often!"),
    );
    expect(result.messagesForUser).not.toContain("No instruments found.");
  });

  it("provides no-instruments suggestion when no instruments are found", () => {
    setupBasicMocks("12.2", {
      live_set: "live_set_id",
      "live_set tracks 0": "track0",
      "live_set tracks 1": "track1",
    });
    mockLiveApiGet(
      createLiveSetConfig({
        name: "Empty Project",
        tracks: children("track0", "track1"),
        scenes: children("scene0"),
        extra: {
          "live_set tracks 0": { has_midi_input: 1, devices: [] },
          "live_set tracks 1": { has_midi_input: 1, devices: [] },
        },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(1);

    const result = connect();

    expect(result.messagesForUser).toStrictEqual(
      expect.stringContaining("* No instruments found."),
    );
  });

  it("handles null host track index gracefully", () => {
    setupBasicMocks("12.2", {
      live_set: "live_set_id",
      "live_set tracks 0": "track0",
    });
    mockLiveApiGet(
      createLiveSetConfig({
        name: "No Host Index Project",
        tracks: children("track0"),
        scenes: children("scene0"),
        extra: { "live_set tracks 0": { has_midi_input: 1, devices: [] } },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(null);

    const result = connect();

    expect(result).toStrictEqual(
      expect.objectContaining({
        connected: true,
        liveSet: expect.objectContaining({ trackCount: 1, sceneCount: 1 }),
      }),
    );
  });

  it("handles empty Live Set correctly", () => {
    setupBasicMocks("12.2", { live_set: "live_set_id" });
    mockLiveApiGet(createLiveSetConfig({ name: "Empty Live Set" }));
    vi.mocked(getHostTrackIndex).mockReturnValue(null);

    const result = connect();

    expect(result).toStrictEqual(
      expect.objectContaining({
        connected: true,
        liveSet: expect.objectContaining({ trackCount: 0, sceneCount: 0 }),
        messagesForUser: expect.stringContaining("* No instruments found"),
      }),
    );
  });

  it("includes scale property when scale is enabled", () => {
    setupBasicMocks();
    mockLiveApiGet(
      createLiveSetConfig({
        name: "Scale Test Project",
        liveSetExtra: { scale_mode: 1, scale_name: "Minor", root_note: 3 },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    expect(connect().liveSet.scale).toBe("Eb Minor");
  });

  it("excludes scale property when scale is disabled", () => {
    setupBasicMocks();
    mockLiveApiGet(
      createLiveSetConfig({
        name: "No Scale Project",
        liveSetExtra: { scale_mode: 0, scale_name: "Major", root_note: 0 },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    expect(connect().liveSet.scale).toBeUndefined();
  });

  it("omits name property when Live Set name is empty string", () => {
    setupBasicMocks();
    mockLiveApiGet(createLiveSetConfig({ name: "" }));
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    expect(result.liveSet.name).toBeUndefined();
    expect(result.liveSet).not.toHaveProperty("name");
  });

  it("skips non-instrument devices when searching for instruments", () => {
    // Test that the inner loop continues when a device is not an instrument (effect device)
    setupBasicMocks("12.2", {
      live_set: "live_set_id",
      "live_set tracks 0": "track0",
      "live_set tracks 0 devices 0": "effect_device",
      "live_set tracks 0 devices 1": "synth_device",
    });
    mockLiveApiGet(
      createLiveSetConfig({
        name: "Mixed Devices Project",
        tracks: children("track0"),
        scenes: children("scene0"),
        extra: {
          track0: {
            has_midi_input: 1,
            devices: children("effect_device", "synth_device"),
          },
          effect_device: { type: 0 }, // Audio effect type
          synth_device: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
        },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    // Should find the instrument after skipping the effect
    expect(result.messagesForUser).not.toContain("No instruments found.");
  });

  it("breaks outer loop after finding first instrument", () => {
    // Test the outer break when foundAnyInstrument is true
    setupBasicMocks("12.2", {
      live_set: "live_set_id",
      "live_set tracks 0": "track0",
      "live_set tracks 1": "track1",
      "live_set tracks 0 devices 0": "synth_device0",
      "live_set tracks 1 devices 0": "synth_device1",
    });
    mockLiveApiGet(
      createLiveSetConfig({
        name: "Multi-Instrument Project",
        tracks: children("track0", "track1"),
        scenes: children("scene0"),
        extra: {
          track0: { has_midi_input: 1, devices: children("synth_device0") },
          track1: { has_midi_input: 1, devices: children("synth_device1") },
          synth_device0: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
          synth_device1: { type: LIVE_API_DEVICE_TYPE_INSTRUMENT },
        },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    // Should have found instrument and broken out of loop early
    expect(result.messagesForUser).not.toContain("No instruments found.");
  });
});
