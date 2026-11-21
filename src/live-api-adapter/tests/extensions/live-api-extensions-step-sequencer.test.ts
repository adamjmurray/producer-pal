// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  setMidiClipType,
  type MidiClipEra,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { LiveAPI } from "#src/test/mocks/mock-live-api.ts";
import {
  clearMockRegistry,
  type RegisteredMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
import { registerLiveVersion } from "#src/tools/shared/schema/scale/tests/scale-test-helpers.ts";
import "../../live-api-extensions.ts";
import { beginLiveApiScope, endLiveApiScope } from "../../live-api-release.ts";

function plainMidiClip(): RegisteredMockObject {
  return registerMockObject("clip-1", {
    path: livePath.track(0).clipSlot(0).clip(),
    type: "Clip",
    properties: { is_midi_clip: 1 },
  });
}

function midiClip(era: MidiClipEra): LiveAPI {
  const mock = plainMidiClip();

  setMidiClipType(mock, era);

  return LiveAPI.from("id clip-1");
}

describe("LiveAPI extensions - isStepSequencerClip", () => {
  beforeEach(() => {
    clearMockRegistry();
  });

  it("is true when midi_clip_type reads the list [1]", () => {
    expect(midiClip("step-sequencer").isStepSequencerClip).toBe(true);
  });

  it("is false when midi_clip_type reads the list [0]", () => {
    expect(midiClip("notes").isStepSequencerClip).toBe(false);
  });

  it("is false on Live 12, where Max answers a bare 1, not a list", () => {
    expect(midiClip("live-12").isStepSequencerClip).toBe(false);
  });

  it("is false for a bare 1 even where the version says Live 13", () => {
    const mock = plainMidiClip();

    setMidiClipType(mock, "live-12", "13.0");

    expect(LiveAPI.from("id clip-1").isStepSequencerClip).toBe(false);
  });

  it("is false when the property isn't there at all", () => {
    plainMidiClip();

    expect(LiveAPI.from("id clip-1").isStepSequencerClip).toBe(false);
  });

  it("never reads midi_clip_type on an audio clip, which refuses it", () => {
    const mock = registerMockObject("clip-1", {
      path: livePath.track(0).clipSlot(0).clip(),
      type: "Clip",
      properties: { is_midi_clip: 0, is_audio_clip: 1 },
    });

    expect(LiveAPI.from("id clip-1").isStepSequencerClip).toBe(false);
    expect(mock.get).not.toHaveBeenCalledWith("midi_clip_type");
  });

  it("reads midi_clip_type once per clip in a request", () => {
    const mock = plainMidiClip();

    setMidiClipType(mock, "step-sequencer");
    beginLiveApiScope();

    try {
      const clip = LiveAPI.from("id clip-1");

      expect(clip.isStepSequencerClip).toBe(true);
      expect(clip.isStepSequencerClip).toBe(true);
      expect(
        mock.get.mock.calls.filter(([prop]) => prop === "midi_clip_type"),
      ).toHaveLength(1);
    } finally {
      endLiveApiScope();
    }
  });

  it.each(["12.4.15", "12.9.9"])(
    "doesn't read midi_clip_type at all on Live %s, which has no such property",
    (version) => {
      const mock = plainMidiClip();

      setMidiClipType(mock, "step-sequencer", version);

      expect(LiveAPI.from("id clip-1").isStepSequencerClip).toBe(false);
      expect(mock.get).not.toHaveBeenCalledWith("midi_clip_type");
    },
  );

  it("reads it on Live 13, a beta included", () => {
    const clip = midiClip("step-sequencer");

    registerLiveVersion("13.0b25");

    expect(clip.isStepSequencerClip).toBe(true);
  });

  it("asks a caller that already read is_midi_clip for nothing more than the type", () => {
    const mock = plainMidiClip();

    setMidiClipType(mock, "step-sequencer");

    expect(LiveAPI.from("id clip-1").midiClipIsStepSequencer).toBe(true);
    expect(mock.get).not.toHaveBeenCalledWith("is_midi_clip");
  });

  it("asks Live for its version once per request", () => {
    const first = midiClip("notes");

    registerMockObject("clip-2", {
      path: livePath.track(0).clipSlot(1).clip(),
      type: "Clip",
      properties: { is_midi_clip: 1 },
    });
    const asked = registerLiveVersion("13.0");

    beginLiveApiScope();

    try {
      expect(first.isStepSequencerClip).toBe(false);
      expect(LiveAPI.from("id clip-2").isStepSequencerClip).toBe(false);
      expect(asked()).toBe(1);
    } finally {
      endLiveApiScope();
    }
  });
});
