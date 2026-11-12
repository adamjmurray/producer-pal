// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  clearMockRegistry,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerLiveVersion } from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import { clipKind } from "../slot-contents/clip-kind.ts";
import {
  isReturnTrackClip,
  requireReturnClips,
  returnClipsExist,
  returnClipWriteRefusal,
  returnSlotWriteRefusal,
} from "../slot-contents/return-track-clips.ts";

function clip(path: string, properties: Record<string, unknown>): LiveAPI {
  registerMockObject("clip-1", { path, type: "Clip", properties });

  return LiveAPI.from("id clip-1");
}

describe("clipKind", () => {
  beforeEach(() => {
    clearMockRegistry();
    registerLiveVersion("13.0");
  });

  it("tells envelope from audio on Live 13 by the two flags, wherever the clip sits", () => {
    const path = livePath.track(0).clipSlot(0).clip();

    expect(clipKind(clip(path, { is_audio_clip: 0 }), false)).toBe("envelope");
    expect(clipKind(clip(path, { is_audio_clip: 1 }), false)).toBe("audio");
  });

  it("never calls a clip an envelope clip on Live 12", () => {
    registerLiveVersion("12.4.15");

    expect(
      clipKind(
        clip(livePath.track(0).clipSlot(0).clip(), { is_audio_clip: 0 }),
        false,
      ),
    ).toBe("audio");
  });

  it("calls MIDI clips midi, or step-sequencer when Live says so", () => {
    const path = livePath.track(0).clipSlot(0).clip();

    expect(clipKind(clip(path, { midi_clip_type: [0] }), true)).toBe("midi");
    expect(clipKind(clip(path, { midi_clip_type: [1] }), true)).toBe(
      "step-sequencer",
    );
  });
});

describe("return-track clip checks", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("says Live 12 has none and Live 13 does", () => {
    registerLiveVersion("12.4.15");
    expect(returnClipsExist()).toBe(false);
    expect(() => requireReturnClips()).toThrow(
      "return-track clips need Live 13",
    );
    expect(returnSlotWriteRefusal()).toBe("return-track clips need Live 13");

    clearMockRegistry();
    registerLiveVersion("13.0");
    expect(returnClipsExist()).toBe(true);
    expect(() => requireReturnClips()).not.toThrow();
    expect(returnSlotWriteRefusal()).toBe(
      "return-track clips can't be changed yet",
    );
  });

  it("refuses writes to a clip in a return track's slot and no other", () => {
    const inReturn = clip(livePath.returnTrack(0).clipSlot(1).clip(), {});

    expect(isReturnTrackClip(inReturn)).toBe(true);
    expect(returnClipWriteRefusal(inReturn)).toBe(
      "return-track clips can't be changed yet",
    );

    clearMockRegistry();
    const regular = clip(livePath.track(0).clipSlot(1).clip(), {});

    expect(returnClipWriteRefusal(regular)).toBeNull();
  });
});
