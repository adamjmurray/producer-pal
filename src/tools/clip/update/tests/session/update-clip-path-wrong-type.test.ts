// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A path can land on an object that isn't a clip. That target is skipped, and
// the rest of the call goes on.

import { describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { type ClipResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  setupMidiClipMock,
  setupUpdateClipMocks,
} from "#src/tools/clip/update/helpers/update-clip-test-helpers.ts";
import { updateClip } from "#src/tools/clip/update/update-clip.ts";

describe("updateClip - a path that names something other than a clip", () => {
  it("skips that target and updates the others", async () => {
    const mocks = setupUpdateClipMocks();

    setupMidiClipMock(mocks.clip123);
    registerMockObject("not-a-clip", {
      path: livePath.track(2).clipSlot(0).clip(),
      type: "Scene",
    });

    const result = (await updateClip({
      path: "t0/s0,t2/s0",
      color: "#FF0000",
    })) as ClipResult[];

    expect(result[0]).toStrictEqual(expect.objectContaining({ id: "123" }));
    expect(result[1]).toStrictEqual({
      path: "t2/s0",
      ok: false,
      detail: "t2/s0 (id not-a-clip) is not a clip (found scene)",
    });
  });
});
