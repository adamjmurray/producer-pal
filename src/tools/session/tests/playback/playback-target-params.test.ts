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
});
