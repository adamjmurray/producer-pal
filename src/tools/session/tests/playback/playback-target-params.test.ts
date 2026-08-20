// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { playback } from "#src/tools/session/playback.ts";
import { setupPlaybackLiveSet } from "./playback-test-helpers.ts";

describe("playback target params on actions that have no target", () => {
  let liveSet: RegisteredMockObject;

  beforeEach(() => {
    liveSet = setupPlaybackLiveSet();
  });

  // The transport command has to run. Parsing a leftover param the action never
  // reads turned "stop" into a format error and left Live playing.
  it("stops even when slots names nothing parseable", () => {
    const warn = vi.spyOn(console, "warn");

    const result = playback({ action: "stop", slots: "bogus" });

    expect(liveSet.call).toHaveBeenCalledWith("stop_playing");
    expect(result.playing).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      'slots ignored: action "stop" names no clips to act on',
    );
  });

  it("plays the arrangement even when path names nothing parseable", () => {
    const result = playback({ action: "play-arrangement", path: "nonsense" });

    expect(liveSet.call).toHaveBeenCalledWith("start_playing");
    expect(result.playing).toBe(true);
  });

  it("names every target param it ignored", () => {
    const warn = vi.spyOn(console, "warn");

    playback({
      action: "stop-all-session-clips",
      path: "t0/s0",
      slots: "0/0",
      ids: "clip1",
    });

    expect(liveSet.call).toHaveBeenCalledWith("stop_all_clips");
    expect(warn).toHaveBeenCalledWith(
      'path/slots/ids ignored: action "stop-all-session-clips" names no clips to act on',
    );
  });

  it("says nothing when no target param was sent", () => {
    const warn = vi.spyOn(console, "warn");

    playback({ action: "stop" });

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("playback ids that names no clip", () => {
  let clipSlot: RegisteredMockObject;

  beforeEach(() => {
    setupPlaybackLiveSet();
    clipSlot = registerMockObject(livePath.track(0).clipSlot(1), {
      path: livePath.track(0).clipSlot(1),
    });
  });

  // z.coerce.string() renders a JSON null as "null", so a caller that sent no
  // ids at all was refused for naming both ids and path.
  it("fires the path's clip when ids is a coerced null, and says so", () => {
    const warn = vi.spyOn(console, "warn");

    playback({ action: "play-session-clips", path: "t0/s1", ids: "null" });

    expect(clipSlot.call).toHaveBeenCalledWith("fire");
    expect(warn).toHaveBeenCalledWith('ids "null" names nothing');
  });

  it("fires the path's clip when ids is blank, without a word", () => {
    const warn = vi.spyOn(console, "warn");

    playback({ action: "play-session-clips", path: "t0/s1", ids: "  " });

    expect(clipSlot.call).toHaveBeenCalledWith("fire");
    expect(warn).not.toHaveBeenCalled();
  });

  // Nothing named a clip, so the call has nothing to fire — and the message
  // says that rather than reporting a launch that didn't happen.
  it("refuses the action when a coerced-null ids is all there is", () => {
    expect(() =>
      playback({ action: "play-session-clips", ids: "null" }),
    ).toThrow("playback failed: ids or path is required for action");
  });

  it("still refuses ids and path together when both name clips", () => {
    expect(() =>
      playback({ action: "play-session-clips", path: "t0/s1", ids: "clip1" }),
    ).toThrow("playback failed: ids and path are mutually exclusive");
  });

  // A scene path is still a path. Firing the ids and dropping it silently is
  // the wrong-target bug these params exist to prevent.
  it("refuses ids alongside a scene path too", () => {
    expect(() =>
      playback({ action: "play-session-clips", path: "s3", ids: "clip1" }),
    ).toThrow("playback failed: ids and path are mutually exclusive");
  });
});

// parseSlotList drops empty entries and returns none, and an empty list read as
// a target is a call that acts on nothing while reporting success.
describe("playback slots that names no position", () => {
  beforeEach(() => {
    setupPlaybackLiveSet();
  });

  it("refuses play-scene rather than crashing on the empty list", () => {
    expect(() => playback({ action: "play-scene", slots: "," })).toThrow(
      'playback failed: sceneIndex or path "s<scene>" is required',
    );
  });

  it("refuses play-session-clips rather than reporting a launch", () => {
    expect(() =>
      playback({ action: "play-session-clips", slots: "," }),
    ).toThrow("playback failed: ids or path is required");
  });

  it("refuses stop-session-clips the same way", () => {
    expect(() =>
      playback({ action: "stop-session-clips", slots: "," }),
    ).toThrow("playback failed: ids or path is required");
  });

  it("lets ids carry the call when slots names nothing", () => {
    const clipSlot = registerMockObject(livePath.track(0).clipSlot(1), {
      path: livePath.track(0).clipSlot(1),
    });

    registerMockObject("clip1", {
      path: livePath.track(0).clipSlot(1).clip(),
      type: "Clip",
    });

    playback({ action: "play-session-clips", slots: ",", ids: "clip1" });

    expect(clipSlot.call).toHaveBeenCalledWith("fire");
  });
});

// Each handler reads only its own kind of target, so a wrong-shaped path used
// to fall through to a "you gave me nothing" error naming the param that was
// sent. Say what's wrong with it, and what the right shape looks like.
describe("playback path shaped wrong for the action", () => {
  beforeEach(() => {
    setupPlaybackLiveSet();
  });

  it("refuses a session position for play-scene, naming the scene to use", () => {
    expect(() => playback({ action: "play-scene", path: "t0/s1" })).toThrow(
      'invalid path "t0/s1" - names a session position; action "play-scene" ' +
        'takes one scene, as path "s1" or sceneIndex 1',
    );
  });

  it("refuses a session position from the deprecated slots too", () => {
    expect(() => playback({ action: "play-scene", slots: "0/1" })).toThrow(
      'invalid slots "0/1" - names a session position',
    );
  });

  it("refuses a scene for play-session-clips, pointing at play-scene", () => {
    expect(() =>
      playback({ action: "play-session-clips", path: "s3" }),
    ).toThrow(
      'invalid path "s3" - names a scene; action "play-session-clips" takes ' +
        'session positions "t<track>/s<scene>" (e.g., "t0/s3"), or use ' +
        'action "play-scene" for the whole scene',
    );
  });

  // There's no "stop a scene" action to point at, so don't invent one.
  it("refuses a scene for stop-session-clips without suggesting play-scene", () => {
    expect(() =>
      playback({ action: "stop-session-clips", path: "s3" }),
    ).toThrow(
      'invalid path "s3" - names a scene; action "stop-session-clips" takes ' +
        'session positions "t<track>/s<scene>" (e.g., "t0/s3")',
    );
    expect(() =>
      playback({ action: "stop-session-clips", path: "s3" }),
    ).not.toThrow(/play-scene/);
  });
});
