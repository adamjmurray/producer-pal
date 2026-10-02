// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  masterTrackMockObject,
  setupLiveSetPathMappedMocks,
} from "./read-live-set-path-mapped-test-helpers.ts";

interface LocatorLiveSetConfig {
  numerator?: number;
  denominator?: number;
  isPlaying?: number;
  songLength?: number;
}

interface SetupLocatorMocksOptions {
  // name as number simulates Live returning an all-digit name as a number
  cuePoints?: Array<{ id: string; time: number; name?: string | number }>;
  liveSet?: LocatorLiveSetConfig;
}

/**
 * Setup mocks for locator operation tests using the mock registry.
 * Configures the live_set handle's get mock and registers cue point objects.
 * @param liveSetHandle - The live_set mock object handle
 * @param options - Configuration options
 * @param options.cuePoints - Cue point definitions
 * @param options.liveSet - Live set properties
 * @returns Map of cue point ID to mock object handle
 */
export function setupLocatorMocks(
  liveSetHandle: RegisteredMockObject,
  { cuePoints = [], liveSet = {} }: SetupLocatorMocksOptions = {},
): Map<string, RegisteredMockObject> {
  const { numerator = 4, denominator = 4, isPlaying = 0, songLength } = liveSet;

  const cueIds = cuePoints.map((c) => c.id);

  const liveSetProps: Record<string, unknown> = {
    signature_numerator: numerator,
    signature_denominator: denominator,
    is_playing: isPlaying,
    cue_points: children(...cueIds),
  };

  if (songLength !== undefined) {
    liveSetProps.song_length = songLength;
  }

  liveSetHandle.get.mockImplementation((prop: string) => {
    if (prop in liveSetProps) {
      const value = liveSetProps[prop];

      return Array.isArray(value) ? value : [value];
    }

    return [0];
  });

  // The playhead goes where it's sent, so a locator write finds it there.
  liveSetHandle.set.mockImplementation((prop: string, value: unknown) => {
    if (prop === "current_song_time") {
      liveSetProps.current_song_time = value;
    }
  });

  const handles = new Map<string, RegisteredMockObject>();

  for (const [index, cp] of cuePoints.entries()) {
    const props: Record<string, unknown> = { time: cp.time };

    if (cp.name != null) {
      props.name = cp.name;
    }

    handles.set(
      cp.id,
      registerMockObject(cp.id, {
        path: livePath.cuePoint(index),
        properties: props,
      }),
    );
  }

  return handles;
}

interface LocatorCreationConfig {
  time?: number;
  isPlaying?: number;
  songLength?: number;
}

/**
 * Setup mocks for locator creation tests with tracking.
 * Returns a tracker and the new cue point handle.
 * @param liveSetHandle - The live_set mock object handle
 * @param config - Configuration options
 * @param config.time - Cue point time in beats
 * @param config.isPlaying - Playing state (0 or 1)
 * @param config.songLength - Song length in beats
 * @returns Tracker object and new cue handle
 */
export function setupLocatorCreationMocks(
  liveSetHandle: RegisteredMockObject,
  config: LocatorCreationConfig = {},
): {
  getCreated: () => boolean;
  newCue: RegisteredMockObject;
} {
  const { time = 0, isPlaying = 0, songLength = 1000 } = config;
  let locatorCreated = false;
  let playhead = 0;

  // An ordinary Live object id, the way a real cue point reports one.
  const newCue = registerMockObject("26", {
    path: livePath.cuePoint(0),
    properties: { time },
  });

  liveSetHandle.get.mockImplementation((prop: string) => {
    if (prop === "signature_numerator") {
      return [4];
    }

    if (prop === "signature_denominator") {
      return [4];
    }

    if (prop === "is_playing") {
      return [isPlaying];
    }

    if (prop === "song_length") {
      return [songLength];
    }

    if (prop === "cue_points") {
      return locatorCreated ? children("26") : children();
    }

    if (prop === "current_song_time") {
      return [playhead];
    }

    return [0];
  });

  liveSetHandle.set.mockImplementation((prop: string, value: unknown) => {
    if (prop === "current_song_time") {
      playhead = value as number;
    }
  });

  liveSetHandle.call.mockImplementation((method: string) => {
    if (method === "set_or_delete_cue") {
      locatorCreated = true;
    }
  });

  return { getCreated: () => locatorCreated, newCue };
}

interface SetupRoutingTestOptions {
  trackProps?: Record<string, unknown>;
}

/**
 * Setup common mocks for routing tests with a single track.
 * Configures registry-based live_set and track objects for test data.
 * @param options - Configuration options
 * @param options.trackProps - Additional properties to include on the track
 */
export function setupRoutingTestMocks(
  options: SetupRoutingTestOptions = {},
): void {
  const { trackProps = {} } = options;

  setupLiveSetPathMappedMocks({
    liveSetId: "live_set_id",
    pathIdMap: {
      [String(livePath.track(0))]: "track1",
      [String(livePath.masterTrack())]: "master",
    },
    objects: {
      LiveSet: {
        name: "Routing Test Set",
        tracks: children("track1"),
        return_tracks: children(),
        scenes: [],
      },
      [String(livePath.track(0))]: {
        has_midi_input: 1,
        name: "Test Track",
        ...trackProps,
      },
      ...masterTrackMockObject(),
    },
  });
}

export interface SimulatedLocator {
  time: number;
  name: string;
}

/** How the simulated Set misbehaves, and the meter it's in. */
export interface SimulateLocatorOptions {
  /** Time signature numerator and denominator (default 4/4) */
  meter?: [number, number];
  /** A time in beats the playhead never reaches */
  stallAt?: number;
  /** A time in beats where a cue toggle makes no locator */
  noCueAt?: number;
}

/**
 * A live_set whose cue points really come and go, so a call that creates or
 * deletes several locators reads back what the earlier ones did.
 * @param liveSetHandle - The live_set mock object handle
 * @param initial - Locators already in the Set, in time order
 * @param options - Meter and misbehavior
 * @returns A reader for the locators the Set holds now
 */
export function simulateLocators(
  liveSetHandle: RegisteredMockObject,
  initial: SimulatedLocator[] = [],
  { meter = [4, 4], stallAt, noCueAt }: SimulateLocatorOptions = {},
): { locators: () => SimulatedLocator[] } {
  const cues: Array<{ id: string; properties: Record<string, unknown> }> = [];
  let playhead = 0;
  // Live hands out ordinary object ids, assigned on creation.
  let nextId = 26;

  const register = (): void => {
    for (const [index, cue] of cues.entries()) {
      const handle = registerMockObject(cue.id, {
        path: livePath.cuePoint(index),
        properties: cue.properties,
      });

      // The default set mock only stores numbers, so a name write needs this to
      // read back.
      handle.set.mockImplementation((property: string, value: unknown) => {
        cue.properties[property] = value;
      });
    }
  };

  const addCue = (time: number, name: string): void => {
    cues.push({ id: String(nextId++), properties: { time, name } });
    cues.sort(
      (a, b) => (a.properties.time as number) - (b.properties.time as number),
    );
    register();
  };

  for (const locator of initial) {
    addCue(locator.time, locator.name);
  }

  liveSetHandle.get.mockImplementation((prop: string) => {
    switch (prop) {
      case "signature_numerator":
        return [meter[0]];
      case "signature_denominator":
        return [meter[1]];
      case "song_length":
        return [1000];
      case "current_song_time":
        return [playhead];
      case "cue_points":
        return children(...cues.map((cue) => cue.id));
      default:
        return [0];
    }
  });

  liveSetHandle.set.mockImplementation((prop: string, value: unknown) => {
    if (prop === "current_song_time" && value !== stallAt) {
      playhead = value as number;
    }
  });

  // set_or_delete_cue toggles a locator at the playhead, the way Live does.
  liveSetHandle.call.mockImplementation((method: string) => {
    if (method !== "set_or_delete_cue") {
      return;
    }

    const index = cues.findIndex((cue) => cue.properties.time === playhead);

    if (index === -1) {
      if (playhead !== noCueAt) {
        addCue(playhead, "");
      }
    } else {
      cues.splice(index, 1);
      register();
    }
  });

  return {
    locators: () =>
      cues.map((cue) => ({
        time: cue.properties.time as number,
        name: cue.properties.name as string,
      })),
  };
}
