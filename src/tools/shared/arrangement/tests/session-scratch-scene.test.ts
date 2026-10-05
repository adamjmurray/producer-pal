// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Audio helpers build a scratch clip in a session slot. When the last scene
// holds clips they make a scene for it, and it must not outlive the helper.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as consoleMock from "#src/shared/max/v8-max-console.ts";
import { handleUnloopedLengthening } from "#src/tools/clip/arrangement/helpers/unlooped-lengthening.ts";
import { handleArrangementShortening } from "#src/tools/clip/arrangement/helpers/arrangement-length-changes.ts";
import { newClipReasons } from "#src/tools/clip/update/helpers/entries/clip-reasons.ts";
import {
  cleanupTempClip,
  extendSongIfNeeded,
} from "#src/tools/live-set/helpers/song-extension.ts";
import {
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import {
  createAndDeleteTempClip,
  createAudioClipInSession,
  removeSessionClip,
} from "../helpers/arrangement-tiling-clips.ts";
import { registerSceneWorld } from "./helpers/session-scene-test-helpers.ts";

vi.mock(import("#src/shared/max/v8-max-console.ts"), () => ({
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
}));

const context = { silenceWavPath: "/tmp/silence.wav" };

/**
 * @returns Track 0
 */
function track(): LiveAPI {
  return LiveAPI.from(livePath.track(0));
}

/**
 * Registers an audio clip on t0 for a helper to work on.
 * @param properties - What the clip reads back
 * @returns The clip
 */
function registerAudioClip(properties: Record<string, unknown>): LiveAPI {
  registerMockObject("scene_world_source", {
    path: livePath.track(0).arrangementClip(5),
    type: "Clip",
    properties: { is_arrangement_clip: 1, ...properties },
  });

  return LiveAPI.from("id scene_world_source");
}

/** Where a caller says what it couldn't remove: its clip's entry, or a warning. */
type Report = (message: string) => void;

/**
 * Each caller of the helper, run once on a Set whose only scene holds clips.
 * The clip tools say what they couldn't remove on the clip's entry; the song
 * extension has no entry, so it warns.
 */
const CALLERS: Array<[string, (report: Report) => void]> = [
  [
    "an arrangement tile",
    (report) => {
      createAndDeleteTempClip(track(), 8, 4, false, {
        ...context,
        reportScratch: report,
      });
    },
  ],
  [
    "a shortened audio clip",
    (report) => {
      handleArrangementShortening({
        clip: registerAudioClip({}),
        isAudioClip: true,
        arrangementLengthBeats: 4,
        currentStartTime: 0,
        currentEndTime: 8,
        context,
        reportScratch: report,
      });
    },
  ],
  [
    "a lengthened warped audio clip",
    (report) => {
      const reasons = newClipReasons();

      handleUnloopedLengthening({
        clip: registerAudioClip({
          warping: 1,
          end_marker: 4,
          loop_start: 0,
          loop_end: 4,
          file_path: "/audio/take.wav",
        }),
        isAudioClip: true,
        arrangementLengthBeats: 12,
        currentArrangementLength: 4,
        currentEndTime: 4,
        clipStartMarker: 0,
        track: track(),
        reasons,
      });

      for (const said of reasons.said.get("scene_world_source") ?? []) {
        report(said);
      }
    },
  ],
  [
    "a song extended for a locator",
    (report) => {
      const extension = extendSongIfNeeded(
        LiveAPI.from(livePath.liveSet),
        200,
        context,
      );

      expect(extension).not.toBeNull();
      cleanupTempClip(extension);

      for (const [message] of vi.mocked(consoleMock.warn).mock.calls) {
        report(String(message));
      }
    },
  ],
];

/** Makes Live refuse to remove a scene, as it can. */
function refuseSceneRemoval(): void {
  const liveSet = lookupMockObject(undefined, livePath.liveSet);

  liveSet!.methods.delete_scene = () => {
    throw new Error("Live says no");
  };
}

describe("the scene an audio helper makes for its scratch clip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(CALLERS)("is gone after %s", (_caller, run) => {
    const world = registerSceneWorld(false);

    run(() => {});

    expect(
      lookupMockObject(undefined, livePath.liveSet)?.call,
    ).toHaveBeenCalledWith("create_scene", 1);
    expect(world.sceneCount()).toBe(1);
  });

  it.each(CALLERS)(
    "is not made after %s when the last scene is empty",
    (_caller, run) => {
      const world = registerSceneWorld(true);

      run(() => {});

      expect(
        lookupMockObject(undefined, livePath.liveSet)?.call,
      ).not.toHaveBeenCalledWith("create_scene", expect.anything());
      expect(world.sceneCount()).toBe(1);
    },
  );

  // The scene is Live's to refuse, and the call is mid-way through other work:
  // it says so where the caller has somewhere to say it, and goes on.
  it.each(CALLERS)("is reported by %s when it stays", (_caller, run) => {
    const world = registerSceneWorld(false);
    const said: string[] = [];

    refuseSceneRemoval();
    run((message) => said.push(message));

    expect(said).toStrictEqual([
      "left an empty scene behind: couldn't remove the scratch scene (Live says no)",
    ]);
    expect(world.sceneCount()).toBe(2);
  });

  // The clip tools put it on the clip's entry, so only the song extension warns.
  it.each(CALLERS.slice(0, 3))("is not a warning from %s", (_caller, run) => {
    registerSceneWorld(false);
    refuseSceneRemoval();

    run(() => {});

    expect(consoleMock.warn).not.toHaveBeenCalled();
  });

  it("names the scene it made, and no scene when it made none", () => {
    registerSceneWorld(false);

    expect(
      createAudioClipInSession(track(), 4, "/tmp/a.wav").sceneId,
    ).toBeDefined();

    registerSceneWorld(true);

    expect(
      createAudioClipInSession(track(), 4, "/tmp/a.wav"),
    ).not.toHaveProperty("sceneId");
  });

  it("warns when the scene is no longer there to remove", () => {
    registerSceneWorld(false);

    const session = createAudioClipInSession(track(), 4, "/tmp/a.wav");

    removeSessionClip({ slot: session.slot, sceneId: "id scene_world_gone" });

    expect(consoleMock.warn).toHaveBeenCalledWith(
      expect.stringContaining("left an empty scene behind"),
    );
  });

  it("says when the scratch clip itself can't be removed, and still removes the scene", () => {
    const world = registerSceneWorld(false);
    const session = createAudioClipInSession(track(), 4, "/tmp/a.wav");
    const said: string[] = [];

    session.slot.call = () => {
      throw new Error("Live says no");
    };

    removeSessionClip(session, (message) => said.push(message));

    expect(said).toStrictEqual([
      "couldn't remove the scratch session clip (Live says no)",
    ]);
    expect(world.sceneCount()).toBe(1);
  });
});

// A throw between making the scratch clip and removing it must not leave the
// clip or its scene behind, and must not be hidden by the cleanup.
describe("a failure while the scratch clip exists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Makes the arrangement copy of the scratch clip fail, as Live can. */
  function refuseArrangementCopy(): void {
    const t = lookupMockObject(undefined, livePath.track(0));

    t!.methods.duplicate_clip_to_arrangement = () => {
      throw new Error("Live says no");
    };
  }

  it.each([CALLERS[0], CALLERS[1], CALLERS[3]] as typeof CALLERS)(
    "leaves no scene after %s",
    (_caller, run) => {
      const world = registerSceneWorld(false);

      refuseArrangementCopy();

      expect(() => run(() => {})).toThrow("Live says no");
      expect(world.sceneCount()).toBe(1);
    },
  );

  it("leaves no scene when a lengthened clip can't read its file's end", () => {
    const world = registerSceneWorld(false, true);
    const [, run] = CALLERS[2] as (typeof CALLERS)[number];

    expect(() => run(() => {})).toThrow("Live says no");
    expect(world.sceneCount()).toBe(1);
  });
});
