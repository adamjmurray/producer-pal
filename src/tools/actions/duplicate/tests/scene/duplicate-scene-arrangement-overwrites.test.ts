// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A scene copied to the arrangement says what each of its clips overwrote.

import { describe, expect, it } from "vitest";
import "../duplicate-mocks-test-helpers.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import { registerLiveLane } from "#src/tools/actions/duplicate/tests/clip/overwrites/duplicate-live-lane-test-helpers.ts";
import {
  createStandardMidiClipMock,
  registerClipSlot,
  setupArrangementSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";

interface Entry {
  id?: string;
  path?: string;
  detail?: string;
}

interface SceneEntry {
  clips: Entry[];
  detail?: string;
}

/** A scene with one 8-beat clip on each of the first two tracks. */
function registerScene(): void {
  setupArrangementSceneMocks(2);
  registerClipSlot(0, 0, true, createStandardMidiClipMock());
  registerClipSlot(1, 0, true, createStandardMidiClipMock());
}

/**
 * Copy the scene to arrangement positions.
 * @param toPath - The positions
 * @returns The result
 */
async function copyScene(toPath: string): Promise<SceneEntry | SceneEntry[]> {
  return (await duplicate({ type: "scene", id: "scene1", toPath })) as
    | SceneEntry
    | SceneEntry[];
}

describe("a scene copied to the arrangement", () => {
  it("says on each clip what it overwrote", async () => {
    registerScene();
    registerLiveLane({
      trackIndex: 0,
      clips: [{ id: "x", start: 16, end: 20 }],
    });
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "y", start: 8, end: 40 }],
    });

    expect(await copyScene("[5|1]")).toStrictEqual({
      clips: [
        {
          id: "copy-0-0",
          path: "t0[5|1]",
          detail: "overwrote the clip at t0[5|1]",
        },
        {
          // The split gave its tail the lane's first new id.
          id: "copy-1-1",
          path: "t1[5|1]",
          detail: "split the clip at t1[3|1] into t1[3|1] and t1[7|1]",
        },
      ],
    });
  });

  it("says nothing for a track whose lane was clear", async () => {
    registerScene();
    registerLiveLane({ trackIndex: 0 });
    registerLiveLane({
      trackIndex: 1,
      clips: [{ id: "y", start: 16, end: 20 }],
    });

    const result = (await copyScene("[5|1]")) as SceneEntry;

    expect(result.clips.map((clip) => clip.detail)).toStrictEqual([
      undefined,
      "overwrote the clip at t1[5|1]",
    ]);
  });

  // The first copy leaves the rest of the clip under a new id. Live made it,
  // not the call, so the second copy covering it overwrote a clip that was there.
  it("shares one view of a lane between the scene's copies", async () => {
    registerScene();
    registerLiveLane({
      trackIndex: 0,
      clips: [{ id: "x", start: 16, end: 32 }],
    });
    registerLiveLane({ trackIndex: 1 });

    const result = (await copyScene("[5|1],[7|1]")) as SceneEntry[];

    expect(result.map(({ clips }) => clips[0]?.detail)).toStrictEqual([
      "shortened the clip at t0[7|1]",
      "overwrote the clip at t0[7|1]",
    ]);
  });

  // The track has no copy to carry what it cleared, so the scene's entry does.
  it("says what a track cleared when Live made it no copy", async () => {
    registerScene();

    const first = registerLiveLane({
      trackIndex: 0,
      clips: [{ id: "x", start: 16, end: 20 }],
    });

    registerLiveLane({ trackIndex: 1 });
    first.declineNextWrite();

    expect(await copyScene("[5|1]")).toStrictEqual({
      clips: [{ id: "copy-1-0", path: "t1[5|1]" }],
      detail: "Live made no copy on t0, but overwrote the clip at t0[5|1]",
    });
  });

  it("names a track that cleared nothing and got no copy", async () => {
    registerScene();

    const first = registerLiveLane({ trackIndex: 0 });

    registerLiveLane({ trackIndex: 1 });
    first.declineNextWrite();

    expect(await copyScene("[5|1]")).toStrictEqual({
      clips: [{ id: "copy-1-0", path: "t1[5|1]" }],
      detail: "Live made no copy on t0",
    });
  });

  it("lets two copies without clips share a position", async () => {
    registerScene();

    // Neither writes anything, so neither can be written over.
    expect(
      await duplicate({
        type: "scene",
        id: "scene1",
        toPath: "[5|1],[5|1]",
        withoutClips: true,
      }),
    ).toStrictEqual([{ clips: [] }, { clips: [] }]);
  });
});
