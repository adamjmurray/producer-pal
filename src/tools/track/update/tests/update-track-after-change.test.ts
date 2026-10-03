// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A throw after part of a track landed keeps the track's normal entry, with a
// detail for what landed and what didn't. Later targets still run.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerTakeLaneTrack } from "#src/tools/shared/arrangement/tests/helpers/take-lane-test-helpers.ts";
import {
  LIVE_FAILURE,
  failOnSet,
  hookCalls,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import { updateTrack } from "../update-track.ts";
import { registerReturnTracks } from "./sends/send-return-fixtures.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

const ROUTING = {
  available_output_routing_types: [
    '{"available_output_routing_types": [{"display_name": "Track Out", "identifier": 25}]}',
  ],
};

/** The mock objects one track of the call is made of. */
interface Parts {
  track: RegisteredMockObject;
  volume: RegisteredMockObject;
  panning: RegisteredMockObject;
  sends: RegisteredMockObject[];
}

/**
 * Register a track at an index with a mixer, two sends and routing to write.
 * @param index - The track's index
 * @returns The mocks a test makes fail
 */
function registerTrack(index: number): Parts {
  const mixer = livePath.track(index).mixerDevice();
  const id = String(123 + index * 333);
  const [first, second] = [`send_${index}_a`, `send_${index}_b`];

  registerMockObject(`mixer_${index}`, {
    path: mixer,
    properties: { sends: children(first, second) },
  });

  return {
    track: registerMockObject(id, {
      path: livePath.track(index),
      properties: ROUTING,
    }),
    volume: registerMockObject(`volume_${index}`, { path: `${mixer} volume` }),
    panning: registerMockObject(`panning_${index}`, {
      path: `${mixer} panning`,
    }),
    sends: [registerMockObject(first, {}), registerMockObject(second, {})],
  };
}

describe("updateTrack - a throw after a change landed", () => {
  let tracks: Parts[];

  beforeEach(() => {
    registerReturnTracks();
    tracks = [0, 1, 2].map(registerTrack);
  });

  /**
   * Make the middle track's write throw, and update all three.
   * @param fail - Makes the part throw
   * @param args - What the call asks of the tracks
   * @returns The call's entries
   */
  function updateAllFailingOnSecond(
    fail: (parts: Parts) => void,
    args: object,
  ): unknown[] {
    fail(tracks[1] as Parts);

    return updateTrack({ id: "123,456,789", ...args }) as unknown[];
  }

  it.each([
    [
      "color",
      (parts: Parts) => failOnSet(parts.track, "color"),
      { name: "A", color: "#FF0000" },
      "name",
    ],
    [
      "mute",
      (parts: Parts) => failOnSet(parts.track, "mute"),
      { name: "A", color: "#FF0000", mute: true },
      "name, color",
    ],
    [
      "gainDb",
      (parts: Parts) => failOnSet(parts.volume),
      { name: "A", gainDb: -6 },
      "name",
    ],
    [
      "pan",
      (parts: Parts) => failOnSet(parts.panning),
      { name: "A", gainDb: -6, pan: 0.5 },
      "name, gainDb",
    ],
    [
      "pan after a panning mode",
      (parts: Parts) => failOnSet(parts.panning),
      { name: "A", panningMode: "stereo", pan: 0.5 },
      "name, panningMode",
    ],
    [
      "routing",
      (parts: Parts) => failOnSet(parts.track, "output_routing_type"),
      { name: "A", mute: true, outputRoutingType: "Track Out" },
      "name, mute",
    ],
    [
      "monitoring state",
      (parts: Parts) => failOnSet(parts.track, "current_monitoring_state"),
      { name: "A", monitoringState: "in" },
      "name",
    ],
    [
      "a send",
      (parts: Parts) => failOnSet(parts.sends[1] as RegisteredMockObject),
      {
        name: "A",
        sends: [
          { return: "A", gainDb: -6 },
          { return: "B", gainDb: -9 },
        ],
      },
      "name, send A-Reverb",
    ],
  ])(
    "names what landed before the %s write threw, with no ok",
    (_what, fail, args, landed) => {
      const result = updateAllFailingOnSecond(fail, args);

      expect(result[0]).toStrictEqual(
        expect.objectContaining({ id: "123", path: "t0" }),
      );
      expect(result[1]).toStrictEqual({
        id: "456",
        path: "t1",
        detail: `${LIVE_FAILURE}; already changed: ${landed}`,
      });
      expect(result[2]).toStrictEqual(
        expect.objectContaining({ id: "789", path: "t2" }),
      );
    },
  );

  it("is the plain skip when nothing landed before the throw", () => {
    const result = updateAllFailingOnSecond(
      (parts) => failOnSet(parts.track, "name"),
      { name: "A" },
    );

    expect(result[1]).toStrictEqual({
      id: "456",
      ok: false,
      detail: LIVE_FAILURE,
    });
  });

  it("leaves tracks the deadline never reached as skips", () => {
    const start = 1_000_000;
    let now = start;

    vi.spyOn(Date, "now").mockImplementation(() => now);
    // The first track uses up the time.
    (tracks[0] as Parts).track.set.mockImplementation(() => {
      now = start + 5000;
    });

    expect(
      updateTrack({ id: "123,456,789", name: "A" }, { deadline: start + 1000 }),
    ).toStrictEqual([
      { id: "123", path: "t0" },
      {
        id: "456",
        ok: false,
        detail: "the request ran out of time; re-run for this track",
      },
      {
        id: "789",
        ok: false,
        detail: "the request ran out of time; re-run for this track",
      },
    ]);
    expect((tracks[1] as Parts).track.set).not.toHaveBeenCalled();
  });
});

describe("updateTrack - a throw after a take lane was made", () => {
  it("keeps the lane's entry, saying it was made and not named", () => {
    const track = registerTakeLaneTrack({ initialLanes: 0 });

    hookCalls(track, /^create_take_lane$/, {
      after: () =>
        failOnSet(
          lookupMockObject(
            undefined,
            livePath.track(0).takeLane(0),
          ) as RegisteredMockObject,
        ),
    });

    expect(updateTrack({ path: "t0/l+", name: "Take A" })).toStrictEqual({
      id: expect.any(String),
      path: "t0/l0",
      created: "l0",
      detail: `${LIVE_FAILURE}; already changed: take lane l0 made`,
    });
  });
});
