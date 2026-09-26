// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
