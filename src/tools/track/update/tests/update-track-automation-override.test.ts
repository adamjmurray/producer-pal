// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  automatedParam,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { updateTrack } from "../update-track.ts";
import { registerReturnTracks } from "./sends/send-return-fixtures.ts";
import {
  NOT_OVERRIDING_CASES,
  OVERRIDDEN,
} from "#src/tools/shared/arrangement/tracks/tests/automation-override-test-helpers.ts";
import "#src/live-api-adapter/live-api-extensions.ts";

describe("updateTrack - overriding arrangement automation", () => {
  let volume: RegisteredMockObject;
  let panning: RegisteredMockObject;
  let activator: RegisteredMockObject;
  let send: RegisteredMockObject;
  let volume2: RegisteredMockObject;
  let track: RegisteredMockObject;

  beforeEach(() => {
    const mixer = (n: number): string => livePath.track(n).mixerDevice();

    track = registerMockObject("123", { path: livePath.track(0) });
    registerMockObject("456", { path: livePath.track(1) });
    registerMockObject("mixer_1", {
      path: mixer(0),
      properties: { sends: children("send_1") },
    });
    registerMockObject("mixer_2", { path: mixer(1) });
    volume = registerMockObject("volume_1", { path: `${mixer(0)} volume` });
    volume2 = registerMockObject("volume_2", { path: `${mixer(1)} volume` });
    panning = registerMockObject("panning_1", { path: `${mixer(0)} panning` });
    activator = registerMockObject("activator_1", {
      path: `${mixer(0)} track_activator`,
    });
    send = registerMockObject("send_1", {});
    registerReturnTracks("A-Reverb");
  });

  it("says so when a gain write overrides the lane", () => {
    automatedParam(volume, 1, true);

    expect(updateTrack({ id: "123", gainDb: -3 })).toStrictEqual({
      id: "123",
      path: "t0",
      detail: `gainDb: ${OVERRIDDEN}`,
    });
  });

  it("says so for pan, and for each field that overrode", () => {
    automatedParam(volume, 1, true);
    automatedParam(panning);

    const result = updateTrack({ id: "123", gainDb: -3, pan: 0.5 });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0",
      detail: `gainDb: ${OVERRIDDEN}; pan: ${OVERRIDDEN}`,
    });
  });

  it("says so on the send's own entry", () => {
    automatedParam(send, 1, true);

    const result = updateTrack({
      id: "123",
      sends: [{ return: "A", gainDb: -12 }],
    }) as { sends: unknown[] };

    expect(result.sends).toStrictEqual([
      expect.objectContaining({ return: "A-Reverb", detail: OVERRIDDEN }),
    ]);
  });

  it("says so for mute, which drives the track activator", () => {
    automatedParam(activator, 1, true, track);

    const result = updateTrack({ id: "123", mute: true });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0",
      detail: `mute: ${OVERRIDDEN}`,
    });
  });

  it("gives each track its own note", () => {
    automatedParam(volume, 1, true);
    automatedParam(volume2, 2, true);

    expect(updateTrack({ id: "123,456", gainDb: -3 })).toStrictEqual([
      { id: "123", path: "t0", detail: `gainDb: ${OVERRIDDEN}` },
      { id: "456", path: "t1" },
    ]);
  });

  it.each(NOT_OVERRIDING_CASES)("says nothing for %s", (_, state, changes) => {
    automatedParam(volume, state, changes);
    automatedParam(activator, state, changes, track);
    automatedParam(send, state, changes);

    const result = updateTrack({
      id: "123",
      gainDb: -3,
      mute: true,
      sends: [{ return: "A", gainDb: -12 }],
    });

    expect(result).toStrictEqual({ id: "123", path: "t0" });
  });

  it("does not look at a parameter the call didn't write", () => {
    automatedParam(volume, 1, true);
    updateTrack({ id: "123", pan: 0.5 });

    expect(volume.get).not.toHaveBeenCalledWith("automation_state");
  });
});
