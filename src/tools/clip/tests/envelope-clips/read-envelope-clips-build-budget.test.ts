// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What Live 13's return-track clip slots cost a read: one object per slot, once.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolves } from "#src/live-api-adapter/tests/objects/build-budget-resolves.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { readLiveSet } from "#src/tools/live-set/read-live-set.ts";
import { readTrack } from "#src/tools/track/read/read-track.ts";
import {
  registerEnvelopeWorld,
  RETURNS,
  SCENES,
} from "./envelope-clip-test-helpers.ts";

const RETURN_SLOT_CLIP = "live_set return_tracks * clip_slots * clip";

describe("return-track clips build budget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  it("walks the return tracks' slots once for a Live Set read", () => {
    registerEnvelopeWorld();

    readLiveSet({ include: ["scenes", "tracks"] });

    // Twice this many means the scenes' counts, the return tracks' counts or
    // each return track's own read went over the same slots again.
    expect(resolves(RETURN_SLOT_CLIP)).toBe(RETURNS * SCENES);
  });

  it("walks no slot of a return track on Live 12", () => {
    registerEnvelopeWorld("12.4.15");

    readLiveSet({ include: ["scenes", "tracks"] });

    expect(resolves(RETURN_SLOT_CLIP)).toBe(0);
  });

  // The walk looks for a Drum Rack to spell notes in drum mode, and a return
  // track's clips hold none.
  it("never walks a return track's devices for a drum rack", () => {
    registerEnvelopeWorld();
    const walks = vi.spyOn(LiveAPI.prototype, "someChild");

    readTrack({ path: "t0", include: ["session-clips", "notes"] });
    expect(walks).toHaveBeenCalled();

    walks.mockClear();
    readTrack({ path: "rt1", include: ["session-clips", "notes"] });
    expect(walks).not.toHaveBeenCalled();
  });
});
