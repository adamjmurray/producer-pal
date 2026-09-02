// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { registerMockObject } from "#src/test/mocks/mock-registry.ts";
import { createClip } from "../create-clip.ts";
import {
  registerEmptyClipSlot,
  setupArrangementClipMocks,
} from "./create-clip-test-helpers.ts";

vi.mock(import("#src/tools/session/select.ts"), () => ({
  select: vi.fn(),
}));

// A MIDI clip with an audio-only transform: warns once per clip, with the same
// text every time, which is exactly what the label has to tell apart.
const AUDIO_TRANSFORM_ON_MIDI = "gain = 3";
const IGNORED = "Audio parameters (gain, pitchShift) ignored for MIDI clips";

describe("createClip - transforms name the clip they warn about", () => {
  beforeEach(() => {
    registerMockObject("live-set", {
      path: livePath.liveSet,
      properties: {
        signature_numerator: 4,
        signature_denominator: 4,
        scale_mode: 0,
      },
    });
  });

  it("names the destination, with no ordinal for a single clip", async () => {
    registerEmptyClipSlot(0);

    await createClip({
      slot: "0/0",
      notes: "C3 1|1",
      transforms: AUDIO_TRANSFORM_ON_MIDI,
    });

    expect(capturedWarnings()).toStrictEqual([`clip t0/s0: ${IGNORED}`]);
  });

  it("tells two firings of the same reason apart", async () => {
    registerEmptyClipSlot(0);
    registerEmptyClipSlot(1);

    await createClip({
      slot: "0/0, 0/1",
      notes: "C3 1|1",
      transforms: AUDIO_TRANSFORM_ON_MIDI,
    });

    expect(capturedWarnings()).toStrictEqual([
      `clip t0/s0 (1 of 2): ${IGNORED}`,
      `clip t0/s1 (2 of 2): ${IGNORED}`,
    ]);
  });

  it("names an arrangement clip by lane and start time", async () => {
    setupArrangementClipMocks();

    await createClip({
      arrangementStart: "1|1",
      trackIndex: 0,
      notes: "C3 1|1",
      transforms: AUDIO_TRANSFORM_ON_MIDI,
    });

    expect(capturedWarnings()).toStrictEqual([`clip t0 at 1|1: ${IGNORED}`]);
  });
});
