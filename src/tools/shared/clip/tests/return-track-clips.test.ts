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
import { clipKind, noNotesReason } from "../slot-contents/clip-kind.ts";
import { ENVELOPE_CLIP_NO_REBUILD, recreateBlocker } from "../recreate-clip.ts";
import { readClipNotesInSpan, removeAllClipNotes } from "../clip-notes.ts";
import {
  isReturnTrackClip,
  requireReturnClips,
  returnClipsExist,
  returnSlotCopyBlocker,
  returnSlotCreateRefusal,
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
    expect(returnSlotCreateRefusal()).toBe("return-track clips need Live 13");

    clearMockRegistry();
    registerLiveVersion("13.0");
    expect(returnClipsExist()).toBe(true);
    expect(() => requireReturnClips()).not.toThrow();
    expect(returnSlotCreateRefusal()).toBe(
      "envelope clips can't be created; make one in Live",
    );
  });

  it("knows a clip in a return track's slot, and no other", () => {
    expect(
      isReturnTrackClip(clip(livePath.returnTrack(0).clipSlot(1).clip(), {})),
    ).toBe(true);

    clearMockRegistry();
    expect(
      isReturnTrackClip(clip(livePath.track(0).clipSlot(1).clip(), {})),
    ).toBe(false);
  });

  it("lets only an envelope clip into a return track's slot", () => {
    registerLiveVersion("13.0");

    const envelope = clip(livePath.returnTrack(0).clipSlot(0).clip(), {});

    expect(returnSlotCopyBlocker(envelope)).toBeNull();

    clearMockRegistry();
    registerLiveVersion("13.0");

    const regular = clip(livePath.track(0).clipSlot(0).clip(), {});

    expect(returnSlotCopyBlocker(regular)).toBe(
      "a return-track slot only takes an envelope clip",
    );

    clearMockRegistry();
    registerLiveVersion("12.4.15");

    expect(returnSlotCopyBlocker(regular)).toBe(
      "return-track clips need Live 13",
    );
  });
});

describe("clips whose notes can't be reached", () => {
  beforeEach(() => {
    clearMockRegistry();
    registerLiveVersion("13.0");
  });

  it("gives an envelope clip its own reason without asking Live", () => {
    const mock = registerMockObject("env", {
      path: livePath.returnTrack(0).clipSlot(0).clip(),
      type: "Clip",
      properties: { is_midi_clip: 0, is_audio_clip: 0 },
    });

    expect(noNotesReason(LiveAPI.from("id env"))).toBe(
      "the clip is an envelope clip",
    );
    expect(mock.get).not.toHaveBeenCalled();
  });

  it("gives a step sequencer clip its reason, and others none", () => {
    const path = livePath.track(0).clipSlot(0).clip();

    expect(
      noNotesReason(clip(path, { is_midi_clip: 1, midi_clip_type: [1] })),
    ).toBe("the clip is a step sequencer");
    expect(
      noNotesReason(clip(path, { is_midi_clip: 1, midi_clip_type: [0] })),
    ).toBeNull();
  });

  it("reads no notes from an envelope clip, and removes none", () => {
    const envelope = registerMockObject("env", {
      path: livePath.returnTrack(0).clipSlot(0).clip(),
      type: "Clip",
      properties: { is_midi_clip: 0, is_audio_clip: 0 },
    });
    const api = LiveAPI.from("id env");

    expect(readClipNotesInSpan(api, 0, 4)).toStrictEqual([]);
    removeAllClipNotes(api);
    expect(envelope.call).not.toHaveBeenCalled();
  });

  it("can't re-create an envelope clip", () => {
    const envelope = clip(livePath.returnTrack(0).clipSlot(0).clip(), {
      is_midi_clip: 0,
      is_audio_clip: 0,
    });

    expect(recreateBlocker(envelope)).toBe(ENVELOPE_CLIP_NO_REBUILD);
    expect(ENVELOPE_CLIP_NO_REBUILD).toBe(
      "it's an envelope clip, and Live's API can't create one",
    );
  });
});
