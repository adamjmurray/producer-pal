// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live can throw partway through writing a clip's scale. What already landed
// stays, so the clip keeps its entry with a detail naming it.

import { beforeEach, describe, expect, it } from "vitest";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  failOnSet,
  LIVE_FAILURE,
} from "#src/tools/shared/tests/write-conformance/write-conformance-fixtures.ts";
import {
  LIVE_WITH_CLIP_SCALE,
  registerLiveVersion,
} from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";

describe("updateClip - Live throws while a clip's scale is written", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    registerLiveVersion(LIVE_WITH_CLIP_SCALE);
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
  });

  it("keeps the entry and says the scale changed when a later write is refused", async () => {
    failOnSet(mocks.clip123, "scale_mode");

    const result = await updateClip({
      id: "123,456",
      scale: "C Major",
    });

    expect(result).toStrictEqual([
      {
        id: "123",
        path: "t0/s0",
        detail: `${LIVE_FAILURE}; already changed: scale`,
      },
      { id: "456", path: "t1/s1" },
    ]);
  });

  it("skips the clip, with nothing changed, when the first write is refused", async () => {
    failOnSet(mocks.clip123, "root_note");

    const result = await updateClip({ id: "123,456", scale: "C Major" });

    expect(result).toStrictEqual([
      { id: "123", ok: false, detail: LIVE_FAILURE },
      { id: "456", path: "t1/s1" },
    ]);
  });

  it("reports only the scale when it throws before anything else is written", async () => {
    failOnSet(mocks.clip123, "scale_name");

    const result = await updateClip({
      id: "123",
      name: "A",
      scale: "C Major",
    });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      detail: `${LIVE_FAILURE}; already changed: scale`,
    });
  });
});
