// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A copy that can't be lengthened is still a copy: its entry says why, and the
// call goes on. Clip and scene copies both lengthen through updateClip.

import { describe, expect, it } from "vitest";
import "../../tests/duplicate-mocks-test-helpers.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicate } from "#src/tools/actions/duplicate/duplicate.ts";
import {
  children,
  createStandardMidiClipMock,
  registerClipSlot,
  registerMockObject,
  setupArrangementSceneMocks,
} from "#src/tools/actions/duplicate/helpers/duplicate-test-helpers.ts";
import {
  registerArrangementClip,
  registerTrackWithArrangementDup,
} from "#src/tools/actions/duplicate/helpers/duplicate-arrangement-test-helpers.ts";
import { updateClipMock } from "../../tests/setup.ts";

const NO_MORE_CONTENT =
  "arrangementLength unchanged: the audio file has no more content to show";

const COPY = {
  id: livePath.track(0).arrangementClip(0),
  path: "t0[5|1]",
  detail: NO_MORE_CONTENT,
};

describe("duplicate - a copy that can't be lengthened", () => {
  it("keeps a clip copy when updateClip refuses its lone target", async () => {
    registerClipSource();
    registerCopyTrack();
    updateClipMock.mockRejectedValueOnce(new Error(NO_MORE_CONTENT));

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "5|1",
      arrangementLength: "4bar",
    });

    expect(result).toStrictEqual(COPY);
  });

  it("keeps a clip copy's entry a hit when updateClip answers ok:false", async () => {
    registerClipSource();
    registerCopyTrack();
    updateClipMock.mockResolvedValueOnce([
      { id: COPY.id, ok: false, detail: NO_MORE_CONTENT },
    ]);

    const result = await duplicate({
      type: "clip",
      id: "clip1",
      arrangementStart: "5|1",
      arrangementLength: "4bar",
    });

    expect(result).toStrictEqual(COPY);
  });

  it("keeps a clip copy when reading it back after lengthening fails", async () => {
    registerClipSource();

    const track = registerTrackWithArrangementDup(0);
    const makeCopy = track.methods
      .duplicate_clip_to_arrangement as () => unknown;
    let copied = false;

    track.methods.duplicate_clip_to_arrangement = () => {
      copied = true;

      return makeCopy();
    };

    Object.defineProperty(track.properties, "arrangement_clips", {
      get() {
        if (copied) {
          throw new Error("Live went away");
        }

        return children();
      },
    });
    registerArrangementClip(0, 0, 16);
    updateClipMock.mockResolvedValueOnce([{ id: COPY.id }]);

    // The clip is on the track, so the failure goes on its entry.
    expect(
      await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "5|1",
        arrangementLength: "4bar",
      }),
    ).toStrictEqual({
      id: COPY.id,
      detail:
        "couldn't finish reading the copy: Live went away; couldn't tell what it overwrote: Live went away",
    });
  });

  it("reports every tile, giving the one that can't be read back its own entry", async () => {
    const tile = (n: number): string => livePath.track(0).arrangementClip(n);

    registerClipSource();
    registerTrackWithArrangementDup(0, {
      arrangement_clips: children(tile(0), "odd", tile(2)),
    });
    registerArrangementClip(0, 0, 16);
    registerArrangementClip(0, 2, 24);
    // An arrangement clip that names no track can't be read back.
    registerMockObject("odd", {
      path: livePath.liveSet,
      properties: { is_arrangement_clip: 1 },
    });
    updateClipMock.mockResolvedValueOnce([
      { id: tile(0) },
      { id: "odd" },
      { id: tile(2) },
    ]);

    expect(
      await duplicate({
        type: "clip",
        id: "clip1",
        arrangementStart: "5|1",
        arrangementLength: "4bar",
      }),
    ).toStrictEqual({
      path: "t0",
      clips: [
        { id: tile(0), path: "t0[5|1]" },
        {
          id: "odd",
          detail: expect.stringContaining("couldn't read the copy back: "),
        },
        { id: tile(2), path: "t0[7|1]" },
      ],
    });
  });

  it("keeps a scene's copy when updateClip refuses its lone target", async () => {
    setupArrangementSceneMocks(1);
    registerClipSlot(0, 0, true, createStandardMidiClipMock({ length: 4 }));
    registerCopyTrack();
    updateClipMock.mockRejectedValueOnce(new Error(NO_MORE_CONTENT));

    const result = await duplicate({
      type: "scene",
      id: "scene1",
      arrangementStart: "5|1",
      arrangementLength: "4bar",
    });

    expect(result).toStrictEqual({ clips: [COPY] });
  });
});

/** Track 0, whose arrangement copy lands at beat 16. */
function registerCopyTrack(): void {
  registerTrackWithArrangementDup(0, {
    arrangement_clips: children(livePath.track(0).arrangementClip(0)),
  });
  registerArrangementClip(0, 0, 16);
}

/** A 4-beat session clip, shorter than every length these tests ask for. */
function registerClipSource(): void {
  registerMockObject("clip1", {
    path: livePath.track(0).clipSlot(0).clip(),
    properties: createStandardMidiClipMock({ length: 4 }),
  });
  registerMockObject("live_set", { path: livePath.liveSet });
}
