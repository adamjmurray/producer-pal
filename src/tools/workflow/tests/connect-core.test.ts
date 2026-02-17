// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type LiveObjectType } from "#src/types/live-object-types.ts";
import { VERSION } from "#src/shared/version.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { getHostTrackIndex } from "#src/tools/shared/arrangement/get-host-track-index.ts";
import { connect } from "../connect.ts";

// Mock the getHostTrackIndex function
vi.mock(
  import("#src/tools/shared/arrangement/get-host-track-index.ts"),
  () => ({
    getHostTrackIndex: vi.fn(() => 1), // Default to track index 1
  }),
);

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
      return_tracks: [],
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

function setupConnectScenario(config: LiveSetConfig, version = "12.3"): void {
  const liveSetProperties = asObject(config.LiveSet);
  const registeredIds = new Set<string>();
  const registeredPaths = new Set<string>();

  registerWithTracking(registeredIds, registeredPaths, "live_set", {
    path: livePath.liveSet,
    type: "Song",
    properties: liveSetProperties,
  });
  registerWithTracking(registeredIds, registeredPaths, "live_app", {
    path: "live_app",
    type: "Application",
    methods: {
      get_version_string: () => version,
    },
  });
  registerWithTracking(registeredIds, registeredPaths, "app_view", {
    path: "live_app view",
    type: "Application.View",
    properties: asObject(config.AppView),
  });

  const trackIds = extractChildIds(liveSetProperties.tracks);

  for (const [trackIndex, trackId] of trackIds.entries()) {
    const track = livePath.track(trackIndex);
    const trackPath = String(track);
    const trackProperties = resolveMappedObjectProperties(
      config,
      trackPath,
      trackId,
    );

    registerWithTracking(registeredIds, registeredPaths, trackId, {
      path: trackPath,
      type: "Track",
      properties: trackProperties,
    });

    const deviceIds = extractChildIds(trackProperties.devices);

    for (const [deviceIndex, deviceId] of deviceIds.entries()) {
      const devicePath = String(track.device(deviceIndex));
      const deviceProperties = resolveMappedObjectProperties(
        config,
        devicePath,
        deviceId,
      );

      registerWithTracking(registeredIds, registeredPaths, deviceId, {
        path: devicePath,
        type: "Device",
        properties: deviceProperties,
      });
    }
  }

  const sceneIds = extractChildIds(liveSetProperties.scenes);

  for (const [sceneIndex, sceneId] of sceneIds.entries()) {
    const scenePath = livePath.scene(sceneIndex);
    const sceneProperties = resolveMappedObjectProperties(
      config,
      scenePath,
      sceneId,
    );

    registerWithTracking(registeredIds, registeredPaths, sceneId, {
      path: scenePath,
      type: "Scene",
      properties: sceneProperties,
    });
  }

  for (const [key, rawProperties] of Object.entries(config)) {
    if (key === "LiveSet" || key === "AppView") {
      continue;
    }

    const properties = asObject(rawProperties);

    if (isLiveApiPathKey(key)) {
      if (registeredPaths.has(key)) {
        continue;
      }

      const id = key.replaceAll(/\s+/g, "/");

      if (registeredIds.has(id)) {
        continue;
      }

      registerWithTracking(registeredIds, registeredPaths, id, {
        path: key,
        properties,
      });
      continue;
    }

    const normalizedId = key.startsWith("id ") ? key.slice(3) : key;

    if (registeredIds.has(normalizedId)) {
      continue;
    }

    registerWithTracking(registeredIds, registeredPaths, normalizedId, {
      properties,
    });
  }
}

function registerWithTracking(
  registeredIds: Set<string>,
  registeredPaths: Set<string>,
  id: string,
  options: {
    path?: string;
    type?: LiveObjectType;
    properties?: Record<string, unknown>;
    methods?: Record<string, (...args: unknown[]) => unknown>;
  },
): void {
  registerMockObject(id, options);
  registeredIds.add(id);

  if (options.path) {
    registeredPaths.add(options.path);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function extractChildIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids: string[] = [];

  for (let index = 0; index < value.length; index += 2) {
    if (value[index] === "id") {
      ids.push(String(value[index + 1]));
    }
  }

  return ids;
}

function resolveMappedObjectProperties(
  config: LiveSetConfig,
  path: string,
  id: string,
): Record<string, unknown> {
  return {
    ...asObject(config[path]),
    ...asObject(config[id]),
    ...asObject(config[`id ${id}`]),
  };
}

function isLiveApiPathKey(key: string): boolean {
  return key.startsWith("live_set ") || key === "live_set";
}

describe("connect", () => {
  it("returns basic Live Set information and connection status", () => {
    setupConnectScenario(
      createLiveSetConfig({
        name: "Test Project",
        is_playing: 1,
        tracks: children("track0", "track1", "track2"),
        scenes: children("scene0", "scene1"),
        extra: {
          [String(livePath.track(0))]: { has_midi_input: 1, devices: [] },
          [String(livePath.track(1))]: { has_midi_input: 1, devices: [] },
          [String(livePath.track(2))]: { has_midi_input: 0, devices: [] },
        },
      }),
      "12.3",
    );

    const result = connect();

    expect(result).toStrictEqual({
      connected: true,
      producerPalVersion: VERSION,
      abletonLiveVersion: "12.3",
      liveSet: {
        name: "Test Project",
        tempo: 120,
        timeSignature: "4/4",
        sceneCount: 2,
        regularTrackCount: 3,
        returnTrackCount: 0,
        isPlaying: true,
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
      "Call ppal-read-live-set with includes for track/scene detail",
    );
    expect(result.$instructions).toContain("Summarize the Live Set");
    expect(result.$instructions).toContain("Say the messagesForUser");
  });

  it("handles arrangement view correctly", () => {
    setupConnectScenario(
      createLiveSetConfig({
        name: "Arrangement Project",
        tempo: 140,
        signature_numerator: 3,
        view: "Arranger",
        tracks: children("track0"),
        scenes: children("scene0"),
        extra: {
          [String(livePath.track(0))]: { has_midi_input: 1, devices: [] },
        },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    expect(result.liveSet).toStrictEqual(
      expect.objectContaining({
        tempo: 140,
        timeSignature: "3/4",
        regularTrackCount: 1,
        returnTrackCount: 0,
      }),
    );
  });

  it("detects instruments on non-host tracks and provides appropriate suggestion", () => {
    setupConnectScenario(
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
      "12.3",
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(1);

    const result = connect();

    expect(result.messagesForUser).toStrictEqual(
      expect.stringContaining("* Save often!"),
    );
    expect(result.messagesForUser).not.toContain("No instruments found.");
  });

  it("provides no-instruments suggestion when no instruments are found", () => {
    setupConnectScenario(
      createLiveSetConfig({
        name: "Empty Project",
        tracks: children("track0", "track1"),
        scenes: children("scene0"),
        extra: {
          [String(livePath.track(0))]: { has_midi_input: 1, devices: [] },
          [String(livePath.track(1))]: { has_midi_input: 1, devices: [] },
        },
      }),
      "12.3",
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(1);

    const result = connect();

    expect(result.messagesForUser).toStrictEqual(
      expect.stringContaining("* No instruments found."),
    );
  });

  it("handles null host track index gracefully", () => {
    setupConnectScenario(
      createLiveSetConfig({
        name: "No Host Index Project",
        tracks: children("track0"),
        scenes: children("scene0"),
        extra: {
          [String(livePath.track(0))]: { has_midi_input: 1, devices: [] },
        },
      }),
      "12.3",
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(null);

    const result = connect();

    expect(result).toStrictEqual(
      expect.objectContaining({
        connected: true,
        liveSet: expect.objectContaining({
          regularTrackCount: 1,
          returnTrackCount: 0,
          sceneCount: 1,
        }),
      }),
    );
  });

  it("handles empty Live Set correctly", () => {
    setupConnectScenario(
      createLiveSetConfig({ name: "Empty Live Set" }),
      "12.3",
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(null);

    const result = connect();

    expect(result).toStrictEqual(
      expect.objectContaining({
        connected: true,
        liveSet: expect.objectContaining({
          regularTrackCount: 0,
          returnTrackCount: 0,
          sceneCount: 0,
        }),
        messagesForUser: expect.stringContaining("* No instruments found"),
      }),
    );
  });

  it("includes scale property when scale is enabled", () => {
    setupConnectScenario(
      createLiveSetConfig({
        name: "Scale Test Project",
        liveSetExtra: {
          scale_mode: 1,
          scale_name: "Minor",
          root_note: 3,
          scale_intervals: [0, 2, 3, 5, 7, 8, 10],
        },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const { liveSet: ls } = connect();

    expect(ls.scale).toBe("Eb Minor");
    expect(ls.scalePitches).toBe("Eb,F,Gb,Ab,Bb,B,Db");
  });

  it("excludes scale property when scale is disabled", () => {
    setupConnectScenario(
      createLiveSetConfig({
        name: "No Scale Project",
        liveSetExtra: { scale_mode: 0, scale_name: "Major", root_note: 0 },
      }),
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    expect(connect().liveSet.scale).toBeUndefined();
  });

  it("omits name property when Live Set name is empty string", () => {
    setupConnectScenario(createLiveSetConfig({ name: "" }));
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    expect(result.liveSet.name).toBeUndefined();
    expect(result.liveSet).not.toHaveProperty("name");
  });

  it("skips non-instrument devices when searching for instruments", () => {
    // Test that the inner loop continues when a device is not an instrument (effect device)
    setupConnectScenario(
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
      "12.3",
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    // Should find the instrument after skipping the effect
    expect(result.messagesForUser).not.toContain("No instruments found.");
  });

  it("breaks outer loop after finding first instrument", () => {
    // Test the outer break when foundAnyInstrument is true
    setupConnectScenario(
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
      "12.3",
    );
    vi.mocked(getHostTrackIndex).mockReturnValue(0);

    const result = connect();

    // Should have found instrument and broken out of loop early
    expect(result.messagesForUser).not.toContain("No instruments found.");
  });
});
