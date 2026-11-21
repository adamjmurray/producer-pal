// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectNoNotesApiCalls,
  type MidiClipEra,
  setMidiClipType,
} from "#src/test/helpers/mock-registry-test-helpers.ts";
import { clearMockRegistry } from "#src/test/mocks/mock-registry.ts";
import { readClip, readOneClip } from "#src/tools/clip/read/read-clip.ts";
import {
  createClipProps44,
  setupAudioClipMock,
  setupMidiClipMock,
} from "#src/tools/clip/read/tests/read-clip-test-helpers.ts";

describe("read-clip - Live 13 step sequencer clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockRegistry();
  });

  /**
   * A MIDI clip with notes, as one Live or another reports its type.
   * @param era - Which Live's answer `midi_clip_type` gives
   * @returns The clip's mock
   */
  function midiClip(era: MidiClipEra) {
    const mock = setupMidiClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: createClipProps44({ muted: 1 }),
    });

    setMidiClipType(mock, era);

    return mock;
  }

  it("reads a step sequencer clip as its own type, with no notes", () => {
    const mock = midiClip("step-sequencer");
    const result = readOneClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["*"],
    });

    expect(result).toStrictEqual(
      expect.objectContaining({
        type: "step-sequencer",
        detail: "steps can't be read",
        looping: false,
        length: "1bar",
        muted: true,
      }),
    );
    expect(result).not.toHaveProperty("notes");
    expect(result).not.toHaveProperty("mutedNotes");
    expectNoNotesApiCalls(mock);
  });

  it("says the same on a clip read by id, without asking for notes", () => {
    const mock = midiClip("step-sequencer");
    const result = readOneClip({ id: mock.id });

    expect(result.type).toBe("step-sequencer");
    expect(result.detail).toBe("steps can't be read");
    expectNoNotesApiCalls(mock);
  });

  it("answers a list read per clip, step sequencer ones included", async () => {
    midiClip("step-sequencer");

    const result = await readClip({ path: "t0/s0" });

    expect(result).toStrictEqual(
      expect.objectContaining({ type: "step-sequencer" }),
    );
  });

  it.each<[MidiClipEra, string]>([
    ["notes", "a Live 13 notes clip"],
    ["live-12", "a Live 12 clip, whatever its bare midi_clip_type says"],
  ])("reads %s (%s) as midi, with its notes", (era) => {
    midiClip(era);
    const result = readOneClip({
      trackIndex: 0,
      sceneIndex: 0,
      include: ["notes"],
    });

    expect(result.type).toBe("midi");
    expect(result).not.toHaveProperty("detail");
    expect(result.notes).toBe("v100 n/4 C3 1|1\nD3 1|2\nE3 1|3");
  });

  it("makes no midi_clip_type read for a MIDI clip on Live 12, nor re-reads is_midi_clip", () => {
    const mock = midiClip("live-12");

    expect(readOneClip({ trackIndex: 0, sceneIndex: 0 }).type).toBe("midi");
    expect(mock.get).not.toHaveBeenCalledWith("midi_clip_type");
    expect(
      mock.get.mock.calls.filter(([prop]) => prop === "is_midi_clip"),
    ).toHaveLength(1);
  });

  it("never asks an audio clip for its midi clip type", () => {
    const mock = setupAudioClipMock({
      trackIndex: 0,
      sceneIndex: 0,
      clipProps: createClipProps44(),
    });

    expect(readOneClip({ trackIndex: 0, sceneIndex: 0 }).type).toBe("audio");
    expect(mock.get).not.toHaveBeenCalledWith("midi_clip_type");
  });
});
