// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live can throw partway through writing a clip's scale. What already landed
// stays, so the clip keeps its entry with a detail naming it.

import { beforeEach, describe, expect, it } from "vitest";
import { type RegisteredMockObject } from "#src/test/mocks/mock-registry.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
  type UpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";
import {
  LIVE_WITH_CLIP_SCALE,
  registerLiveVersion,
} from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";

const REFUSED = "Live refused";

/**
 * Make a mock refuse one property write.
 * @param mock - The registered object
 * @param property - The property whose write throws
 */
function refuseSet(mock: RegisteredMockObject, property: string): void {
  mock.set.mockImplementation((written: string) => {
    if (written === property) {
      throw new Error(REFUSED);
    }
  });
}

describe("updateClip - Live throws while a clip's scale is written", () => {
  let mocks: UpdateClipMocks;

  beforeEach(() => {
    registerLiveVersion(LIVE_WITH_CLIP_SCALE);
    mocks = setupUpdateClipMocks();
    setupMidiClipMock(mocks.clip123);
    setupMidiClipMock(mocks.clip456);
  });

  it("keeps the entry and says the scale changed when a later write is refused", async () => {
    refuseSet(mocks.clip123, "scale_mode");

    const result = await updateClip({
      id: "123,456",
      scale: "C Major",
    });

    expect(result).toStrictEqual([
      {
        id: "123",
        path: "t0/s0",
        detail: `${REFUSED}; already changed: scale`,
      },
      { id: "456", path: "t1/s1" },
    ]);
  });

  it("skips the clip, with nothing changed, when the first write is refused", async () => {
    refuseSet(mocks.clip123, "root_note");

    const result = await updateClip({ id: "123,456", scale: "C Major" });

    expect(result).toStrictEqual([
      { id: "123", ok: false, detail: REFUSED },
      { id: "456", path: "t1/s1" },
    ]);
  });

  it("reports only the scale when it throws before anything else is written", async () => {
    refuseSet(mocks.clip123, "scale_name");

    const result = await updateClip({
      id: "123",
      name: "A",
      scale: "C Major",
    });

    expect(result).toStrictEqual({
      id: "123",
      path: "t0/s0",
      detail: `${REFUSED}; already changed: scale`,
    });
  });
});
